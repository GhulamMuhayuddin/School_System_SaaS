import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { badRequest, conflict, notFound } from '../../utils/errors';
import {
  DEFAULT_SETTINGS, MAX_RENEWALS, accessionNo, addDays, copyChangeProblem, dueProblem, fineFor, loanState, normaliseAccession, overdueDays, type CopyStatusKey, type FineStatusKey,
} from './library.logic';
import type {
  BookCounts, BookDetail, BookDto, BookFilter, BookInput, BookPatch, CopyDto, IssueInput, LibraryApi, LibrarySettingsDto, LibrarySummary, LoanDto, LoanFilter, StudentLibrary,
} from './library.types';

type Tx = Prisma.TransactionClient;
const LIST_LIMIT = 300;
const MAX_COPIES_PER_BOOK = 500;
const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);
const dayText = (d: Date): string => d.toISOString().slice(0, 10);
const fullName = (p: { firstName: string; lastName: string }): string => `${p.firstName} ${p.lastName}`;
const blank = (v: string | null | undefined): string | null => (v === undefined || v === null || v.trim() === '' ? null : v.trim());

const loanInclude = {
  copy: { select: { id: true, accessionNo: true, book: { select: { id: true, title: true, author: true } } } },
  student: { select: { id: true, firstName: true, lastName: true, admissionNo: true, class: { select: { name: true } } } },
} as const;
type LoanRow = Prisma.LibraryLoanGetPayload<{ include: typeof loanInclude }>;

/** Library catalogue, copies, loans and fines. Every query runs under Row Level Security. */
export class LibraryService implements LibraryApi {
  constructor(private readonly prisma: PrismaClient, private readonly now: () => Date = () => new Date()) {}

  private today(): string { return dayText(this.now()); }

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string | null, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: 'library', entityId, metadata } });
  }

  private async settingsIn(tx: Tx, schoolId: string): Promise<LibrarySettingsDto> {
    const s = await tx.librarySettings.findUnique({ where: { schoolId } });
    return s ? { loanDays: s.loanDays, finePerDay: s.finePerDay, maxBooksStudent: s.maxBooksStudent } : { ...DEFAULT_SETTINGS };
  }

  private async reserve(tx: Tx, schoolId: string, key: string, by = 1): Promise<number> {
    const c = await tx.schoolCounter.upsert({ where: { schoolId_key: { schoolId, key } }, update: { value: { increment: by } }, create: { schoolId, key, value: by } });
    return c.value;
  }

  private loanDto(r: LoanRow, today: string, finePerDay: number): LoanDto {
    const due = dayText(r.dueOn);
    const returned = r.returnedOn ? dayText(r.returnedOn) : null;
    const state = loanState(due, returned, today);
    const days = returned ? overdueDays(due, returned) : overdueDays(due, today);
    return {
      id: r.id, copy: { id: r.copy.id, accessionNo: r.copy.accessionNo }, book: r.copy.book, student: { id: r.student.id, name: fullName(r.student), admissionNo: r.student.admissionNo, className: r.student.class?.name ?? null },
      issuedOn: dayText(r.issuedOn), dueOn: due, returnedOn: returned, renewals: r.renewals, state, overdueDays: days,
      fine: returned ? r.fineAmount : fineFor(days, finePerDay), fineStatus: r.fineStatus as FineStatusKey,
    };
  }

  private async loanById(tx: Tx, schoolId: string, id: string): Promise<LoanDto> {
    const r = await tx.libraryLoan.findFirst({ where: { id, schoolId }, include: loanInclude });
    if (!r) throw notFound('Loan not found');
    return this.loanDto(r, this.today(), (await this.settingsIn(tx, schoolId)).finePerDay);
  }

  // ---- settings and summary -------------------------------------------------------------------------------------------
  settings(schoolId: string): Promise<LibrarySettingsDto> {
    return tenantTransaction(this.prisma, schoolId, (tx) => this.settingsIn(tx, schoolId));
  }

  saveSettings(schoolId: string, actorId: string, input: LibrarySettingsDto): Promise<LibrarySettingsDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const data = { loanDays: input.loanDays, finePerDay: input.finePerDay, maxBooksStudent: input.maxBooksStudent };
      await tx.librarySettings.upsert({ where: { schoolId }, update: data, create: { schoolId, ...data } });
      await this.audit(tx, schoolId, actorId, 'library.settings.save', null, data);
      return data;
    });
  }

  summary(schoolId: string): Promise<LibrarySummary> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const today = toDate(this.today());
      const [books, byStatus, overdue, fines] = await Promise.all([
        tx.libraryBook.count({ where: { schoolId, active: true } }),
        tx.libraryCopy.groupBy({ by: ['status'], where: { schoolId, book: { active: true } }, _count: { _all: true } }),
        tx.libraryLoan.count({ where: { schoolId, returnedOn: null, dueOn: { lt: today } } }),
        tx.libraryLoan.aggregate({ where: { schoolId, fineStatus: 'UNPAID' }, _count: { _all: true }, _sum: { fineAmount: true } }),
      ]);
      const n = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
      return {
        books, copies: n('AVAILABLE') + n('ISSUED') + n('LOST'), available: n('AVAILABLE'), issued: n('ISSUED'), overdue,
        unpaidFines: { count: fines._count._all, amount: fines._sum.fineAmount ?? 0 },
      };
    });
  }

  // ---- catalogue ---------------------------------------------------------------------------------------------------------
  private async countsFor(tx: Tx, schoolId: string, bookIds: string[]): Promise<Map<string, BookCounts>> {
    const out = new Map<string, BookCounts>(bookIds.map((id) => [id, { total: 0, available: 0, issued: 0, lost: 0, withdrawn: 0 }]));
    if (bookIds.length === 0) return out;
    const rows = await tx.libraryCopy.groupBy({ by: ['bookId', 'status'], where: { schoolId, bookId: { in: bookIds } }, _count: { _all: true } });
    for (const r of rows) {
      const c = out.get(r.bookId)!;
      const n = r._count._all;
      if (r.status === 'AVAILABLE') c.available += n; else if (r.status === 'ISSUED') c.issued += n; else if (r.status === 'LOST') c.lost += n; else c.withdrawn += n;
      if (r.status !== 'WITHDRAWN') c.total += n;
    }
    return out;
  }

  private bookDto(b: { id: string; title: string; author: string; isbn: string | null; category: string | null; publisher: string | null; language: string | null; location: string | null; active: boolean }, counts: BookCounts): BookDto {
    return { id: b.id, title: b.title, author: b.author, isbn: b.isbn, category: b.category, publisher: b.publisher, language: b.language, location: b.location, active: b.active, counts };
  }

  listBooks(schoolId: string, f: BookFilter): Promise<{ books: BookDto[]; categories: string[]; truncated: boolean }> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const q = f.q?.trim();
      const where: Prisma.LibraryBookWhereInput = {
        schoolId, ...(f.includeInactive ? {} : { active: true }), ...(f.category ? { category: f.category } : {}),
        ...(f.availableOnly ? { copies: { some: { status: 'AVAILABLE' } } } : {}),
        ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { author: { contains: q, mode: 'insensitive' } }, { isbn: { contains: q, mode: 'insensitive' } }, { copies: { some: { accessionNo: { equals: normaliseAccession(q) } } } }] } : {}),
      };
      const [rows, cats] = await Promise.all([
        tx.libraryBook.findMany({ where, orderBy: [{ title: 'asc' }, { createdAt: 'asc' }], take: LIST_LIMIT + 1 }),
        tx.libraryBook.findMany({ where: { schoolId, category: { not: null } }, distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } }),
      ]);
      const truncated = rows.length > LIST_LIMIT;
      const page = rows.slice(0, LIST_LIMIT);
      const counts = await this.countsFor(tx, schoolId, page.map((r) => r.id));
      return { books: page.map((r) => this.bookDto(r, counts.get(r.id)!)), categories: cats.map((c) => c.category!), truncated };
    });
  }

  private async detail(tx: Tx, schoolId: string, id: string): Promise<BookDetail> {
    const b = await tx.libraryBook.findFirst({ where: { id, schoolId } });
    if (!b) throw notFound('Book not found');
    const copies = await tx.libraryCopy.findMany({ where: { schoolId, bookId: id }, orderBy: { accessionNo: 'asc' } });
    const open = await tx.libraryLoan.findMany({
      where: { schoolId, returnedOn: null, copyId: { in: copies.map((c) => c.id) } },
      select: { id: true, copyId: true, dueOn: true, student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
    });
    const byCopy = new Map(open.map((l) => [l.copyId, l]));
    const today = this.today();
    const list: CopyDto[] = copies.map((c) => {
      const l = byCopy.get(c.id);
      return {
        id: c.id, accessionNo: c.accessionNo, status: c.status as CopyStatusKey,
        loan: l ? { id: l.id, student: { id: l.student.id, name: fullName(l.student), admissionNo: l.student.admissionNo }, dueOn: dayText(l.dueOn), overdue: dayText(l.dueOn) < today } : null,
      };
    });
    const counts = (await this.countsFor(tx, schoolId, [id])).get(id)!;
    return { ...this.bookDto(b, counts), copies: list };
  }

  /** Creates `count` copies with the next accession numbers of the school. */
  private async makeCopies(tx: Tx, schoolId: string, bookId: string, count: number): Promise<void> {
    if (count <= 0) return;
    const last = await this.reserve(tx, schoolId, 'library_accession', count);
    await tx.libraryCopy.createMany({ data: Array.from({ length: count }, (_, i) => ({ schoolId, bookId, accessionNo: accessionNo(last - count + 1 + i) })) });
  }

  createBook(schoolId: string, actorId: string, input: BookInput): Promise<BookDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const book = await tx.libraryBook.create({
        data: {
          schoolId, title: input.title.trim(), author: input.author.trim(), isbn: blank(input.isbn), category: blank(input.category), publisher: blank(input.publisher),
          language: blank(input.language), location: blank(input.location), createdById: actorId,
        },
      });
      await this.makeCopies(tx, schoolId, book.id, input.copies ?? 1);
      await this.audit(tx, schoolId, actorId, 'library.book.create', book.id, { title: book.title, copies: input.copies ?? 1 });
      return this.detail(tx, schoolId, book.id);
    });
  }

  getBook(schoolId: string, id: string): Promise<BookDetail> {
    return tenantTransaction(this.prisma, schoolId, (tx) => this.detail(tx, schoolId, id));
  }

  updateBook(schoolId: string, actorId: string, id: string, patch: BookPatch): Promise<BookDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const book = await tx.libraryBook.findFirst({ where: { id, schoolId } });
      if (!book) throw notFound('Book not found');
      if (patch.active === false) {
        const issued = await tx.libraryCopy.count({ where: { schoolId, bookId: id, status: 'ISSUED' } });
        if (issued > 0) throw conflict('Copies of this book are still issued; get them back before retiring the book');
      }
      const data: Prisma.LibraryBookUpdateInput = {};
      if (patch.title !== undefined) data.title = patch.title.trim();
      if (patch.author !== undefined) data.author = patch.author.trim();
      for (const k of ['isbn', 'category', 'publisher', 'language', 'location'] as const) if (patch[k] !== undefined) data[k] = blank(patch[k]);
      if (patch.active !== undefined) data.active = patch.active;
      await tx.libraryBook.update({ where: { id }, data });
      await this.audit(tx, schoolId, actorId, 'library.book.update', id, { fields: Object.keys(patch) });
      return this.detail(tx, schoolId, id);
    });
  }

  addCopies(schoolId: string, actorId: string, id: string, count: number): Promise<BookDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const book = await tx.libraryBook.findFirst({ where: { id, schoolId } });
      if (!book) throw notFound('Book not found');
      if (!book.active) throw conflict('This book is retired');
      const have = await tx.libraryCopy.count({ where: { schoolId, bookId: id } });
      if (have + count > MAX_COPIES_PER_BOOK) throw badRequest(`A book can have at most ${MAX_COPIES_PER_BOOK} copies`);
      await this.makeCopies(tx, schoolId, id, count);
      await this.audit(tx, schoolId, actorId, 'library.copies.add', id, { count });
      return this.detail(tx, schoolId, id);
    });
  }

  setCopyStatus(schoolId: string, actorId: string, copyId: string, status: CopyStatusKey): Promise<BookDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const copy = await tx.libraryCopy.findFirst({ where: { id: copyId, schoolId } });
      if (!copy) throw notFound('Copy not found');
      const problem = copyChangeProblem(copy.status as CopyStatusKey, status);
      if (problem) throw conflict(problem);
      // conditional update: a copy that was issued a moment ago is not changed
      const changed = await tx.libraryCopy.updateMany({ where: { id: copyId, schoolId, status: { not: 'ISSUED' } }, data: { status } });
      if (changed.count !== 1) throw conflict('This copy is issued; return it first');
      await this.audit(tx, schoolId, actorId, 'library.copy.status', copyId, { accessionNo: copy.accessionNo, from: copy.status, to: status });
      return this.detail(tx, schoolId, copy.bookId);
    });
  }

  // ---- loans -----------------------------------------------------------------------------------------------------------------
  issue(schoolId: string, actorId: string, input: IssueInput): Promise<LoanDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const today = this.today();
      const settings = await this.settingsIn(tx, schoolId);
      const dueOn = input.dueOn ?? addDays(today, settings.loanDays);
      const problem = dueProblem(today, dueOn);
      if (problem) throw badRequest(problem);

      const student = await tx.student.findFirst({ where: { id: input.studentId, schoolId, deletedAt: null }, select: { id: true, status: true } });
      if (!student) throw notFound('Student not found');
      if (student.status !== 'ACTIVE') throw badRequest('Books can only be issued to active students');
      // one issue at a time per student, so the limit cannot be passed by two simultaneous requests
      await tx.$queryRaw`SELECT id FROM students WHERE id = ${student.id}::uuid FOR UPDATE`;

      const copy = await tx.libraryCopy.findFirst({
        where: { schoolId, ...(input.copyId ? { id: input.copyId } : { accessionNo: normaliseAccession(input.accessionNo ?? '') }) },
        select: { id: true, accessionNo: true, status: true, book: { select: { title: true, active: true } } },
      });
      if (!copy) throw notFound('Copy not found');
      if (!copy.book.active) throw conflict('This book is retired');
      if (copy.status !== 'AVAILABLE') throw conflict(copy.status === 'ISSUED' ? 'This copy is already issued' : 'This copy is not available');

      const open = await tx.libraryLoan.findMany({ where: { schoolId, studentId: student.id, returnedOn: null }, select: { dueOn: true } });
      if (open.length >= settings.maxBooksStudent) throw conflict(`This student already has ${open.length} book(s) issued (limit ${settings.maxBooksStudent})`);
      if (open.some((l) => dayText(l.dueOn) < today)) throw conflict('This student has an overdue book; return it first');
      const unpaid = await tx.libraryLoan.count({ where: { schoolId, studentId: student.id, fineStatus: 'UNPAID' } });
      if (unpaid > 0) throw conflict('This student has an unpaid library fine');

      const taken = await tx.libraryCopy.updateMany({ where: { id: copy.id, schoolId, status: 'AVAILABLE' }, data: { status: 'ISSUED' } });
      if (taken.count !== 1) throw conflict('This copy is already issued');
      const loan = await tx.libraryLoan.create({ data: { schoolId, copyId: copy.id, studentId: student.id, issuedOn: toDate(today), dueOn: toDate(dueOn), issuedById: actorId } });
      await this.audit(tx, schoolId, actorId, 'library.loan.issue', loan.id, { accessionNo: copy.accessionNo, studentId: student.id, dueOn });
      return this.loanById(tx, schoolId, loan.id);
    });
  }

  returnLoan(schoolId: string, actorId: string, loanId: string): Promise<LoanDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const loan = await tx.libraryLoan.findFirst({ where: { id: loanId, schoolId } });
      if (!loan) throw notFound('Loan not found');
      if (loan.returnedOn) throw conflict('This book was already returned');
      const today = this.today();
      const settings = await this.settingsIn(tx, schoolId);
      const fine = fineFor(overdueDays(dayText(loan.dueOn), today), settings.finePerDay);
      const done = await tx.libraryLoan.updateMany({
        where: { id: loanId, schoolId, returnedOn: null },
        data: { returnedOn: toDate(today), returnedById: actorId, fineAmount: fine, fineStatus: fine > 0 ? 'UNPAID' : 'NONE' },
      });
      if (done.count !== 1) throw conflict('This book was already returned');
      // a copy that was marked lost while issued is not put back on the shelf
      await tx.libraryCopy.updateMany({ where: { id: loan.copyId, schoolId, status: 'ISSUED' }, data: { status: 'AVAILABLE' } });
      await this.audit(tx, schoolId, actorId, 'library.loan.return', loanId, { fine });
      return this.loanById(tx, schoolId, loanId);
    });
  }

  renew(schoolId: string, actorId: string, loanId: string): Promise<LoanDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const loan = await tx.libraryLoan.findFirst({ where: { id: loanId, schoolId } });
      if (!loan) throw notFound('Loan not found');
      if (loan.returnedOn) throw conflict('This book was already returned');
      const today = this.today();
      if (dayText(loan.dueOn) < today) throw conflict('An overdue book cannot be renewed; return it');
      if (loan.renewals >= MAX_RENEWALS) throw conflict(`A book can be renewed at most ${MAX_RENEWALS} times`);
      const settings = await this.settingsIn(tx, schoolId);
      const dueOn = addDays(today, settings.loanDays);
      await tx.libraryLoan.update({ where: { id: loanId }, data: { dueOn: toDate(dueOn), renewals: { increment: 1 } } });
      await this.audit(tx, schoolId, actorId, 'library.loan.renew', loanId, { dueOn });
      return this.loanById(tx, schoolId, loanId);
    });
  }

  settleFine(schoolId: string, actorId: string, loanId: string, action: 'PAID' | 'WAIVED'): Promise<LoanDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const exists = await tx.libraryLoan.findFirst({ where: { id: loanId, schoolId }, select: { id: true } });
      if (!exists) throw notFound('Loan not found');
      const done = await tx.libraryLoan.updateMany({ where: { id: loanId, schoolId, fineStatus: 'UNPAID' }, data: { fineStatus: action } });
      if (done.count !== 1) throw conflict('There is no unpaid fine on this loan');
      await this.audit(tx, schoolId, actorId, action === 'PAID' ? 'library.fine.paid' : 'library.fine.waived', loanId);
      return this.loanById(tx, schoolId, loanId);
    });
  }

  listLoans(schoolId: string, f: LoanFilter): Promise<{ loans: LoanDto[]; truncated: boolean }> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const today = this.today();
      const status = f.status ?? 'open';
      const q = f.q?.trim();
      const where: Prisma.LibraryLoanWhereInput = {
        schoolId, ...(f.studentId ? { studentId: f.studentId } : {}),
        ...(status === 'open' ? { returnedOn: null } : status === 'overdue' ? { returnedOn: null, dueOn: { lt: toDate(today) } } : status === 'returned' ? { returnedOn: { not: null } } : {}),
        ...(q ? { OR: [
          { student: { firstName: { contains: q, mode: 'insensitive' } } }, { student: { lastName: { contains: q, mode: 'insensitive' } } }, { student: { admissionNo: { contains: q, mode: 'insensitive' } } },
          { copy: { accessionNo: { equals: normaliseAccession(q) } } }, { copy: { book: { title: { contains: q, mode: 'insensitive' } } } },
        ] } : {}),
      };
      const rows = await tx.libraryLoan.findMany({
        where, include: loanInclude, take: LIST_LIMIT + 1,
        orderBy: status === 'returned' || status === 'all' ? [{ issuedOn: 'desc' }, { createdAt: 'desc' }] : [{ dueOn: 'asc' }, { createdAt: 'asc' }],
      });
      const finePerDay = (await this.settingsIn(tx, schoolId)).finePerDay;
      return { loans: rows.slice(0, LIST_LIMIT).map((r) => this.loanDto(r, today, finePerDay)), truncated: rows.length > LIST_LIMIT };
    });
  }

  studentLibrary(schoolId: string, studentId: string): Promise<StudentLibrary> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const rows = await tx.libraryLoan.findMany({ where: { schoolId, studentId }, include: loanInclude, orderBy: [{ issuedOn: 'desc' }, { createdAt: 'desc' }], take: 100 });
      const finePerDay = (await this.settingsIn(tx, schoolId)).finePerDay;
      const loans = rows.map((r) => this.loanDto(r, this.today(), finePerDay));
      return { loans, unpaidFine: loans.filter((l) => l.fineStatus === 'UNPAID').reduce((a, l) => a + l.fine, 0) };
    });
  }
}
