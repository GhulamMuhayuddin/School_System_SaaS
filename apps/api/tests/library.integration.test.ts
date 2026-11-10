/**
 * Real database test of Phase 13A (library). Needs the migration with the library_* tables, `pnpm db:rls`, `pnpm db:seed`.
 * Run:  set RUN_DB_TESTS=1  then  pnpm --filter @nexora/api test
 * Fixed clock; defaults: 14 loan days, Rs 5 fine per day, 3 books per student. Expected numbers are worked out in the comments.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LibraryService } from '../src/modules/library/library.service';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('library (PostgreSQL)', () => {
  let owner: PrismaClient; let runtime: PrismaClient;
  let clock = new Date('2026-11-04T09:00:00Z');
  let lib: LibraryService;
  const tag = `lib-${Date.now()}`;
  let a = ''; let b = ''; let actor = '';
  const kid: Record<string, string> = {};
  let bookId = ''; let accessions: string[] = [];
  const copyIds: string[] = [];

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    lib = new LibraryService(runtime, () => clock);
    a = (await owner.school.create({ data: { name: `${tag} A`, code: `${tag}-a` } })).id;
    b = (await owner.school.create({ data: { name: `${tag} B`, code: `${tag}-b` } })).id;
    const role = (await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'librarian' } })).id;
    actor = (await owner.user.create({ data: { schoolId: a, roleId: role, email: `${tag}@example.test`, passwordHash: 'x', firstName: 'Lib', lastName: 'Rarian' } })).id;
    const cls = await owner.schoolClass.create({ data: { schoolId: a, name: 'Class 5', level: 1 } });
    const mk = (n: string, status = 'ACTIVE') => owner.student.create({ data: { schoolId: a, admissionNo: `${tag}-${n}`, firstName: n, lastName: 'K', classId: cls.id, gender: 'MALE', status, dateOfBirth: new Date('2015-01-01T00:00:00Z'), admissionDate: new Date('2026-04-01T00:00:00Z') } as never });
    for (const n of ['Ali', 'Bilal', 'Cara']) kid[n] = (await mk(n)).id;
    kid.gone = (await mk('Gone', 'WITHDRAWN')).id;
  });
  afterAll(async () => {
    await owner.school.deleteMany({ where: { id: { in: [a, b] } } }).catch(() => {});
    await owner.$disconnect(); await runtime.$disconnect();
  });

  it('creates a book with numbered copies and keeps numbers unique', async () => {
    const d = await lib.createBook(a, actor, { title: 'Gulistan', author: 'Saadi', category: 'Poetry', copies: 4 });
    bookId = d.id;
    expect(d.counts).toEqual({ total: 4, available: 4, issued: 0, lost: 0, withdrawn: 0 });
    accessions = d.copies.map((c) => c.accessionNo);
    copyIds.push(...d.copies.map((c) => c.id));
    expect(new Set(accessions).size).toBe(4);
    const more = await lib.addCopies(a, actor, bookId, 2);
    expect(more.counts.total).toBe(6);
    expect(new Set(more.copies.map((c) => c.accessionNo)).size).toBe(6);
    const other = await lib.createBook(b, actor, { title: 'Other school', author: 'X', copies: 1 });
    expect(other.copies[0]!.accessionNo).toBe('LIB-000001'); // counters are per school
  });

  it('issues with the default 14 days, and refuses a second issue of the same copy', async () => {
    const loan = await lib.issue(a, actor, { accessionNo: accessions[0]!.toLowerCase(), studentId: kid.Ali! });
    expect(loan.issuedOn).toBe('2026-11-04');
    expect(loan.dueOn).toBe('2026-11-18');
    expect(loan.state).toBe('OPEN');
    await expect(lib.issue(a, actor, { accessionNo: accessions[0]!, studentId: kid.Bilal! })).rejects.toMatchObject({ status: 409 });
    expect((await lib.getBook(a, bookId)).counts.issued).toBe(1);
  });

  it('two simultaneous issues of one copy: only one wins', async () => {
    const results = await Promise.allSettled([
      lib.issue(a, actor, { accessionNo: accessions[1]!, studentId: kid.Bilal! }),
      lib.issue(a, actor, { accessionNo: accessions[1]!, studentId: kid.Cara! }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ status: 409 });
  });

  it('enforces the per-student limit, active students, due date rules', async () => {
    await lib.issue(a, actor, { accessionNo: accessions[2]!, studentId: kid.Ali! });
    await lib.issue(a, actor, { accessionNo: accessions[3]!, studentId: kid.Ali! });
    const more = await lib.addCopies(a, actor, bookId, 1);
    const spare = more.copies.find((c) => c.status === 'AVAILABLE')!.accessionNo;
    await expect(lib.issue(a, actor, { accessionNo: spare, studentId: kid.Ali! })).rejects.toMatchObject({ status: 409 }); // 3 open already
    await expect(lib.issue(a, actor, { accessionNo: spare, studentId: kid.gone! })).rejects.toMatchObject({ status: 400 });
    await expect(lib.issue(a, actor, { accessionNo: spare, studentId: kid.Cara!, dueOn: '2026-11-04' })).rejects.toMatchObject({ status: 400 });
    await expect(lib.issue(a, actor, { accessionNo: 'LIB-999999', studentId: kid.Cara! })).rejects.toMatchObject({ status: 404 });
    await expect(lib.issue(b, actor, { accessionNo: spare, studentId: kid.Cara! })).rejects.toMatchObject({ status: 404 }); // other school
  });

  it('renews from today, at most twice, and not when overdue', async () => {
    const open = (await lib.listLoans(a, { status: 'open', studentId: kid.Ali! })).loans[0]!;
    clock = new Date('2026-11-10T09:00:00Z');
    const r1 = await lib.renew(a, actor, open.id);
    expect(r1.dueOn).toBe('2026-11-24'); // today + 14
    expect(r1.renewals).toBe(1);
    await lib.renew(a, actor, open.id);
    await expect(lib.renew(a, actor, open.id)).rejects.toMatchObject({ status: 409 });
  });

  it('returns late with a fine (3 days x Rs 5 = 15), blocks issuing until settled, then allows again', async () => {
    const loans = (await lib.listLoans(a, { status: 'open', studentId: kid.Ali! })).loans;
    const target = loans.find((l) => l.renewals === 0)!; // due 2026-11-18
    clock = new Date('2026-11-21T09:00:00Z');
    expect((await lib.listLoans(a, { status: 'overdue' })).loans.some((l) => l.id === target.id)).toBe(true);
    const back = await lib.returnLoan(a, actor, target.id);
    expect(back.state).toBe('RETURNED');
    expect(back.fine).toBe(15);
    expect(back.fineStatus).toBe('UNPAID');
    await expect(lib.returnLoan(a, actor, target.id)).rejects.toMatchObject({ status: 409 });
    expect((await lib.summary(a)).unpaidFines).toEqual({ count: 1, amount: 15 });
    const spare = (await lib.getBook(a, bookId)).copies.find((c) => c.status === 'AVAILABLE')!.accessionNo;
    await expect(lib.issue(a, actor, { accessionNo: spare, studentId: kid.Ali! })).rejects.toMatchObject({ status: 409 });
    const paid = await lib.settleFine(a, actor, target.id, 'PAID');
    expect(paid.fineStatus).toBe('PAID');
    await expect(lib.settleFine(a, actor, target.id, 'WAIVED')).rejects.toMatchObject({ status: 409 });
    expect((await lib.summary(a)).unpaidFines).toEqual({ count: 0, amount: 0 });
  });

  it('on time returns have no fine; the portal view lists loans and the unpaid total', async () => {
    // the race above was won by Bilal or Cara; either way that one loan (due 2026-11-18) is returned on time on the 17th
    const t0 = (await lib.listLoans(a, { status: 'open' })).loans.find((l) => l.student.id === kid.Bilal || l.student.id === kid.Cara)!;
    clock = new Date('2026-11-17T10:00:00Z');
    const back = await lib.returnLoan(a, actor, t0.id);
    expect(back.fine).toBe(0);
    expect(back.fineStatus).toBe('NONE');
    const view = await lib.studentLibrary(a, kid.Ali!);
    expect(view.loans.length).toBe(3);
    expect(view.unpaidFine).toBe(0);
  });

  it('copy status: lost copies are off the shelf, issued ones cannot be changed, a retired book needs all copies back', async () => {
    const d = await lib.getBook(a, bookId);
    const issued = d.copies.find((c) => c.status === 'ISSUED')!;
    await expect(lib.setCopyStatus(a, actor, issued.id, 'LOST')).rejects.toMatchObject({ status: 409 });
    await expect(lib.updateBook(a, actor, bookId, { active: false })).rejects.toMatchObject({ status: 409 });
    const free = d.copies.find((c) => c.status === 'AVAILABLE')!;
    const after = await lib.setCopyStatus(a, actor, free.id, 'LOST');
    expect(after.counts.lost).toBe(1);
    await expect(lib.issue(a, actor, { copyId: free.id, studentId: kid.Cara! })).rejects.toMatchObject({ status: 409 });
    expect((await lib.setCopyStatus(a, actor, free.id, 'AVAILABLE')).counts.lost).toBe(0);
  });

  it('settings change the next issue, and school B cannot see school A data', async () => {
    await lib.saveSettings(a, actor, { loanDays: 7, finePerDay: 10, maxBooksStudent: 5 });
    const spare = (await lib.getBook(a, bookId)).copies.find((c) => c.status === 'AVAILABLE')!;
    clock = new Date('2026-12-01T09:00:00Z');
    const loan = await lib.issue(a, actor, { copyId: spare.id, studentId: kid.Cara! });
    expect(loan.dueOn).toBe('2026-12-08');
    await expect(lib.getBook(b, bookId)).rejects.toMatchObject({ status: 404 });
    expect((await lib.listBooks(b, {})).books.map((x) => x.title)).toEqual(['Other school']);
    expect((await lib.listLoans(b, { status: 'all' })).loans).toHaveLength(0);
    const rls = await runtime.$transaction(async (tx) => { await tx.$executeRaw`SELECT set_config('app.school_id', ${b}, true)`; return tx.libraryLoan.count(); });
    expect(rls).toBe(0);
    const audit = await owner.auditLog.findMany({ where: { schoolId: a, action: { startsWith: 'library.' } }, select: { action: true } });
    expect(audit.filter((x) => x.action === 'library.loan.issue').length).toBeGreaterThanOrEqual(5);
  });
});
