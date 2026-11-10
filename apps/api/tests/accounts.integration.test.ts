/**
 * Real database test of Phase 10B-3: accounts categories, income/expense entries, numbering, void, filters, summary (incl. fee money),
 * monthly report and isolation. Needs the migration that creates account_categories / account_entries, `pnpm db:rls`, `pnpm db:seed`.
 * Run:  set RUN_DB_TESTS=1  then  pnpm --filter @nexora/api test
 * The clock is fixed at 2026-11-04. Expected numbers are worked out by hand in the comments.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountsService } from '../src/modules/accounts/accounts.service';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('accounts (PostgreSQL)', () => {
  let owner: PrismaClient;
  let runtime: PrismaClient;
  let accounts: AccountsService;
  const tag = `acc-${Date.now()}`;
  let a = '';
  let b = '';
  const id: Record<string, string> = {};

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    accounts = new AccountsService(runtime, () => new Date(Date.UTC(2026, 10, 4, 8, 0)));
    const adminRole = (await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'school_admin' } })).id;
    a = (await owner.school.create({ data: { name: `${tag} A`, code: `${tag}-a` } })).id;
    b = (await owner.school.create({ data: { name: `${tag} B`, code: `${tag}-b` } })).id;
    const user = async (label: string, schoolId: string) =>
      (await owner.user.create({ data: { schoolId, roleId: adminRole, email: `${tag}.${label}@example.test`, passwordHash: 'x', firstName: label, lastName: 'User' } })).id;
    id.adminUser = await user('admin', a);
    id.bUser = await user('b', b);

    // Fee money lives in fee_payments: one student, one voucher, three receipts (see the summary test).
    id.session = (await owner.academicSession.create({ data: { schoolId: a, name: '2026-2027', startDate: new Date('2026-04-01T00:00:00Z'), endDate: new Date('2027-03-31T00:00:00Z'), isCurrent: true } })).id;
    id.classId = (await owner.schoolClass.create({ data: { schoolId: a, name: 'Class 5', level: 5 } })).id;
    id.student = (await owner.student.create({ data: { schoolId: a, admissionNo: `${tag}-S1`, firstName: 'S1', lastName: 'Kid', gender: 'MALE', dateOfBirth: new Date('2015-01-01T00:00:00Z'), admissionDate: new Date('2026-04-01T00:00:00Z'), classId: id.classId } })).id;
    id.voucher = (await owner.feeVoucher.create({ data: { schoolId: a, voucherNo: 'V-000001', studentId: id.student, sessionId: id.session, classId: id.classId, period: '2026-11', dueDate: new Date('2026-11-10T00:00:00Z'), totalAmount: 30000, paidAmount: 14000 } })).id;
    const receipt = (no: string, amount: number, paidAt: string, voided = false) =>
      owner.feePayment.create({ data: { schoolId: a, receiptNo: no, voucherId: id.voucher, studentId: id.student, amount, method: 'CASH', paidAt: new Date(paidAt), ...(voided ? { voidedAt: new Date('2026-11-03T12:00:00Z'), voidReason: 'wrong' } : {}) } });
    await receipt('R-000001', 10000, '2026-11-02T08:00:00Z');
    await receipt('R-000002', 4000, '2026-10-20T08:00:00Z');
    await receipt('R-000003', 7000, '2026-11-03T08:00:00Z', true); // voided: never counted
  });

  afterAll(async () => {
    if (!owner) return;
    for (const school of [a, b]) {
      await owner.auditLog.deleteMany({ where: { schoolId: school } });
      await owner.user.deleteMany({ where: { schoolId: school } });
      await owner.school.deleteMany({ where: { id: school } }); // categories, entries, fees, counters ... cascade
    }
    await owner.$disconnect();
    await runtime.$disconnect();
  });

  it('creates categories, refuses a duplicate name in any letter case, allows the same name under the other kind', async () => {
    const don = await accounts.createCategory(a, id.adminUser, { kind: 'INCOME', name: 'Donations' });
    const util = await accounts.createCategory(a, id.adminUser, { kind: 'EXPENSE', name: 'Utilities' });
    const rent = await accounts.createCategory(a, id.adminUser, { kind: 'EXPENSE', name: 'Rent' });
    const old = await accounts.createCategory(a, id.adminUser, { kind: 'EXPENSE', name: 'Old category' });
    Object.assign(id, { don: don.id, util: util.id, rent: rent.id, old: old.id });
    expect(don).toMatchObject({ kind: 'INCOME', name: 'Donations', isActive: true });
    await expect(accounts.createCategory(a, id.adminUser, { kind: 'INCOME', name: 'donations' })).rejects.toMatchObject({ status: 409 });
    await expect(accounts.updateCategory(a, id.adminUser, id.util, { name: 'RENT' })).rejects.toMatchObject({ status: 409 });
    expect((await accounts.createCategory(a, id.adminUser, { kind: 'INCOME', name: 'Rent' })).kind).toBe('INCOME');
    expect((await accounts.updateCategory(a, id.adminUser, id.old, { isActive: false })).isActive).toBe(false);
    expect((await accounts.categories(a, 'EXPENSE')).map((c) => c.name)).toEqual(['Old category', 'Rent', 'Utilities']);
    await expect(accounts.updateCategory(a, id.adminUser, '00000000-0000-4000-8000-000000000000', { isActive: false })).rejects.toMatchObject({ status: 404 });
  });

  it('adds only the common categories that are missing, and a second run adds none', async () => {
    // 11 common ones; "Donations" (income) and "Rent" (expense) already exist, so 9 are new.
    expect(await accounts.addDefaultCategories(a, id.adminUser)).toEqual({ created: 9 });
    expect(await accounts.addDefaultCategories(a, id.adminUser)).toEqual({ created: 0 });
    expect((await accounts.categories(a, 'INCOME')).map((c) => c.name).sort()).toEqual(['Canteen', 'Donations', 'Events and fundraising', 'Other income', 'Rent']);
  });

  it('records entries with separate INC / EXP numbers and refuses bad ones', async () => {
    const e = (kind: 'INCOME' | 'EXPENSE', categoryId: string, amount: number, entryDate: string, description: string, extra: object = {}) =>
      accounts.createEntry(a, id.adminUser, { kind, categoryId, amount, method: 'CASH', entryDate, description, ...extra });
    const inc1 = await e('INCOME', id.don, 5000, '2026-11-02', 'Parent donation', { party: 'Mr Ahmed', reference: 'Slip 12' });
    const exp1 = await e('EXPENSE', id.util, 3000, '2026-11-03', 'Electricity bill');
    const exp2 = await e('EXPENSE', id.rent, 20000, '2026-11-01', 'November rent');
    const inc2 = await e('INCOME', id.don, 800, '2026-10-15', 'October donation');
    Object.assign(id, { inc1: inc1.id, exp1: exp1.id, exp2: exp2.id, inc2: inc2.id });
    expect([inc1.entryNo, exp1.entryNo, exp2.entryNo, inc2.entryNo]).toEqual(['INC-000001', 'EXP-000001', 'EXP-000002', 'INC-000002']);
    expect(inc1).toMatchObject({ kind: 'INCOME', amount: 5000, entryDate: '2026-11-02', party: 'Mr Ahmed', reference: 'Slip 12', voided: false, category: { name: 'Donations' } });

    await expect(e('EXPENSE', id.util, 100, '2026-11-05', 'Tomorrow')).rejects.toMatchObject({ status: 400 }); // future date (today is 2026-11-04)
    await expect(e('EXPENSE', id.don, 100, '2026-11-03', 'Wrong kind')).rejects.toMatchObject({ status: 400 }); // income category used for an expense
    await expect(e('EXPENSE', id.old, 100, '2026-11-03', 'Inactive')).rejects.toMatchObject({ status: 400 });
    await expect(e('EXPENSE', '00000000-0000-4000-8000-000000000000', 100, '2026-11-03', 'No such category')).rejects.toMatchObject({ status: 404 });
    expect(await owner.accountEntry.count({ where: { schoolId: a } })).toBe(4); // refused ones left nothing behind
  });

  it('voids a wrong entry (kept, with reason), refuses a second void and never reuses its number', async () => {
    const typo = await accounts.createEntry(a, id.adminUser, { kind: 'EXPENSE', categoryId: id.util, amount: 99999, method: 'BANK', entryDate: '2026-11-03', description: 'Typo amount' });
    expect(typo.entryNo).toBe('EXP-000003');
    const voided = await accounts.voidEntry(a, id.adminUser, typo.id, 'Wrong amount');
    expect(voided).toMatchObject({ voided: true, voidReason: 'Wrong amount' });
    await expect(accounts.voidEntry(a, id.adminUser, typo.id, 'Again')).rejects.toMatchObject({ status: 409 });
    const next = await accounts.createEntry(a, id.adminUser, { kind: 'EXPENSE', categoryId: id.rent, amount: 1500, method: 'ONLINE', entryDate: '2026-11-04', description: 'Extra rent' });
    expect(next.entryNo).toBe('EXP-000004');
    id.typo = typo.id; id.exp4 = next.id;
    expect(await owner.accountEntry.count({ where: { schoolId: a, id: typo.id } })).toBe(1); // still in the books
    await expect(accounts.voidEntry(a, id.adminUser, '00000000-0000-4000-8000-000000000000', 'Nothing')).rejects.toMatchObject({ status: 404 });
  });

  it('lists newest first with totals that skip voided entries, and filters', async () => {
    // Live entries: INC1 5000 (11-02), INC2 800 (10-15), EXP1 3000 (11-03), EXP2 20000 (11-01), EXP4 1500 (11-04). Voided EXP3 99999 does not count.
    const all = await accounts.listEntries(a, {});
    expect(all.entries.map((x) => x.entryNo)).toEqual(['EXP-000004', 'EXP-000001', 'INC-000001', 'EXP-000002', 'INC-000002']);
    expect(all).toMatchObject({ income: 5800, expense: 24500, truncated: false });
    const withVoided = await accounts.listEntries(a, { includeVoided: true });
    expect(withVoided.entries).toHaveLength(6);
    expect(withVoided).toMatchObject({ income: 5800, expense: 24500 }); // totals still skip the voided one

    expect((await accounts.listEntries(a, { kind: 'INCOME' })).entries).toHaveLength(2);
    expect(await accounts.listEntries(a, { kind: 'INCOME' })).toMatchObject({ income: 5800, expense: 0 });
    const nov = await accounts.listEntries(a, { from: '2026-11-01', to: '2026-11-30' });
    expect(nov.entries).toHaveLength(4);
    expect(nov).toMatchObject({ income: 5000, expense: 24500 });
    expect((await accounts.listEntries(a, { categoryId: id.rent })).entries.map((x) => x.amount)).toEqual([1500, 20000]);
    expect((await accounts.listEntries(a, { method: 'ONLINE' })).entries.map((x) => x.entryNo)).toEqual(['EXP-000004']);
    expect((await accounts.listEntries(a, { q: 'ahmed' })).entries.map((x) => x.entryNo)).toEqual(['INC-000001']); // searches the party too
    expect((await accounts.listEntries(a, { q: 'exp-000002' })).entries).toHaveLength(1);
    expect((await accounts.getEntry(a, id.inc1)).description).toBe('Parent donation');
  });

  it('summary adds fee money collected (voided receipts and other months excluded) to the ledger', async () => {
    // Default range 2026-11-01 .. today (2026-11-04): fees 10000 (R-1), other income 5000, expenses 3000 + 20000 + 1500 = 24500.
    const s = await accounts.summary(a, undefined, undefined);
    expect(s).toMatchObject({ from: '2026-11-01', to: '2026-11-04', feeIncome: 10000, otherIncome: 5000, totalIncome: 15000, expenses: 24500, net: -9500 });
    expect(s.incomeByCategory).toEqual([{ categoryId: id.don, name: 'Donations', amount: 5000, entries: 1 }]);
    expect(s.expenseByCategory.map((c) => [c.name, c.amount, c.entries])).toEqual([['Rent', 21500, 2], ['Utilities', 3000, 1]]);
    // October: fees 4000 (R-2), donation 800, no expenses.
    expect(await accounts.summary(a, '2026-10-01', '2026-10-31')).toMatchObject({ feeIncome: 4000, otherIncome: 800, totalIncome: 4800, expenses: 0, net: 4800 });
    // A single day includes the whole day: R-1 was paid on 2026-11-02 08:00.
    expect(await accounts.summary(a, '2026-11-02', '2026-11-02')).toMatchObject({ feeIncome: 10000, otherIncome: 5000, expenses: 0 });
  });

  it('monthly report has 12 months for the year', async () => {
    const m = await accounts.monthly(a, undefined); // current year 2026
    expect(m.year).toBe(2026);
    expect(m.months).toHaveLength(12);
    expect(m.months[9]).toEqual({ month: '2026-10', feeIncome: 4000, otherIncome: 800, expenses: 0, net: 4800 });
    expect(m.months[10]).toEqual({ month: '2026-11', feeIncome: 10000, otherIncome: 5000, expenses: 24500, net: -9500 });
    expect(m.months[0]).toEqual({ month: '2026-01', feeIncome: 0, otherIncome: 0, expenses: 0, net: 0 });
    expect((await accounts.monthly(a, 2025)).months.every((r) => r.net === 0)).toBe(true);
  });

  it('writes audit rows', async () => {
    const count = (action: string) => owner.auditLog.count({ where: { schoolId: a, action } });
    expect(await count('account.category.create')).toBe(5);
    expect(await count('account.category.update')).toBe(1);
    expect(await count('account.category.defaults')).toBe(1); // the second run created nothing and wrote nothing
    expect(await count('account.entry.create')).toBe(6);
    expect(await count('account.entry.void')).toBe(1);
  });

  it('keeps schools apart, including a raw RLS query', async () => {
    await expect(accounts.getEntry(b, id.inc1)).rejects.toMatchObject({ status: 404 });
    await expect(accounts.voidEntry(b, id.bUser, id.inc1, 'Not mine')).rejects.toMatchObject({ status: 404 });
    await expect(accounts.createEntry(b, id.bUser, { kind: 'INCOME', categoryId: id.don, amount: 100, method: 'CASH', entryDate: '2026-11-03', description: 'Foreign category' })).rejects.toMatchObject({ status: 404 });
    expect(await accounts.categories(b, undefined)).toEqual([]);
    expect(await accounts.listEntries(b, {})).toMatchObject({ entries: [], income: 0, expense: 0 });
    expect(await accounts.summary(b, undefined, undefined)).toMatchObject({ feeIncome: 0, totalIncome: 0, expenses: 0, net: 0 });
    const bCat = await accounts.createCategory(b, id.bUser, { kind: 'INCOME', name: 'Donations' }); // same name as in school A is fine
    expect((await accounts.createEntry(b, id.bUser, { kind: 'INCOME', categoryId: bCat.id, amount: 100, method: 'CASH', entryDate: '2026-11-03', description: 'B donation' })).entryNo).toBe('INC-000001'); // own counter

    const rows = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.school_id', ${b}, true)`;
      return { categories: await tx.accountCategory.findMany(), entries: await tx.accountEntry.findMany() };
    });
    expect(rows.categories.map((c) => c.schoolId)).toEqual([b]);
    expect(rows.entries.map((x) => x.schoolId)).toEqual([b]);
    expect(await owner.accountEntry.count({ where: { schoolId: a } })).toBe(6);
  });
});
