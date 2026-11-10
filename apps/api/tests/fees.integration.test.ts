/**
 * Real database test of Phase 10: fee heads, class fee structure, concessions, voucher generation, payments (partial, overpay,
 * void, cancel), receipt numbers, reports and isolation. Needs the Phase 10 migration, `pnpm db:rls`, `pnpm db:seed`.
 * Run:  set RUN_DB_TESTS=1  then  pnpm --filter @nexora/api test
 * The clock is fixed at 2026-11-04 so "overdue" is predictable.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FeesService } from '../src/modules/fees/fees.service';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('fees (PostgreSQL)', () => {
  let owner: PrismaClient;
  let runtime: PrismaClient;
  let fees: FeesService;
  const tag = `fee-${Date.now()}`;
  let a = '';
  let b = '';
  const id: Record<string, string> = {};
  const rupees = (n: number) => n;

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    fees = new FeesService(runtime, () => new Date(Date.UTC(2026, 10, 4, 8, 0)));
    const adminRole = (await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'school_admin' } })).id;
    a = (await owner.school.create({ data: { name: `${tag} A`, code: `${tag}-a` } })).id;
    b = (await owner.school.create({ data: { name: `${tag} B`, code: `${tag}-b` } })).id;
    const user = async (label: string, schoolId: string) =>
      (await owner.user.create({ data: { schoolId, roleId: adminRole, email: `${tag}.${label}@example.test`, passwordHash: 'x', firstName: label, lastName: 'User' } })).id;
    id.adminUser = await user('admin', a);
    id.bUser = await user('b', b);

    id.session = (await owner.academicSession.create({ data: { schoolId: a, name: '2026-2027', startDate: new Date('2026-04-01T00:00:00Z'), endDate: new Date('2027-03-31T00:00:00Z'), isCurrent: true } })).id;
    id.classId = (await owner.schoolClass.create({ data: { schoolId: a, name: 'Class 5', level: 5 } })).id;
    id.emptyClass = (await owner.schoolClass.create({ data: { schoolId: a, name: 'Class 6', level: 6 } })).id; // no fee structure
    id.emptySection = (await owner.section.create({ data: { schoolId: a, classId: id.emptyClass, name: 'E1' } })).id;
    id.bClass = (await owner.schoolClass.create({ data: { schoolId: b, name: 'Class 5', level: 5 } })).id;
    const student = async (no: string, schoolId: string, classId: string, extra: object = {}) =>
      (await owner.student.create({ data: { schoolId, admissionNo: `${tag}-${no}`, firstName: no, lastName: 'Kid', gender: 'MALE', dateOfBirth: new Date('2015-01-01T00:00:00Z'), admissionDate: new Date('2026-04-01T00:00:00Z'), classId, ...extra } })).id;
    id.k1 = await student('K1', a, id.classId);
    id.k2 = await student('K2', a, id.classId);
    id.k3 = await student('K3', a, id.classId);
    id.gone = await student('GONE', a, id.classId, { status: 'WITHDRAWN' });
    id.bKid = await student('BK', b, id.bClass);
  });

  afterAll(async () => {
    if (!owner) return;
    for (const school of [a, b]) {
      await owner.auditLog.deleteMany({ where: { schoolId: school } });
      await owner.user.deleteMany({ where: { schoolId: school } });
      await owner.school.deleteMany({ where: { id: school } }); // heads, structures, vouchers, payments, counters ... cascade
    }
    await owner.$disconnect();
    await runtime.$disconnect();
  });

  it('creates fee heads, refuses a duplicate name in any letter case, and can deactivate one', async () => {
    const tuition = await fees.createHead(a, id.adminUser, 'Tuition');
    const admission = await fees.createHead(a, id.adminUser, 'Admission fee');
    const old = await fees.createHead(a, id.adminUser, 'Old fee');
    Object.assign(id, { tuition: tuition.id, admission: admission.id, old: old.id });
    expect(tuition).toMatchObject({ name: 'Tuition', isActive: true });
    await expect(fees.createHead(a, id.adminUser, 'tuition')).rejects.toMatchObject({ status: 409 });
    await expect(fees.updateHead(a, id.adminUser, id.admission, { name: 'TUITION' })).rejects.toMatchObject({ status: 409 });
    expect((await fees.updateHead(a, id.adminUser, id.old, { isActive: false })).isActive).toBe(false);
    expect((await fees.heads(a)).map((h) => h.name)).toEqual(['Admission fee', 'Old fee', 'Tuition']);
  });

  it('sets the class fee structure and rejects duplicates, inactive heads, foreign heads and foreign classes', async () => {
    await expect(fees.setStructure(a, id.adminUser, id.classId, undefined, [{ feeHeadId: id.tuition, amount: 1, frequency: 'MONTHLY' }, { feeHeadId: id.tuition, amount: 2, frequency: 'MONTHLY' }])).rejects.toMatchObject({ status: 400 });
    await expect(fees.setStructure(a, id.adminUser, id.classId, undefined, [{ feeHeadId: id.old, amount: 100, frequency: 'MONTHLY' }])).rejects.toMatchObject({ status: 400 });
    const bHead = await fees.createHead(b, id.bUser, 'B tuition');
    await expect(fees.setStructure(a, id.adminUser, id.classId, undefined, [{ feeHeadId: bHead.id, amount: 100, frequency: 'MONTHLY' }])).rejects.toMatchObject({ status: 400 });
    await expect(fees.setStructure(a, id.adminUser, id.bClass, undefined, [])).rejects.toMatchObject({ status: 404 });
    const s = await fees.setStructure(a, id.adminUser, id.classId, undefined, [
      { feeHeadId: id.tuition, amount: rupees(5000), frequency: 'MONTHLY' }, { feeHeadId: id.admission, amount: rupees(2000), frequency: 'ONE_TIME' },
    ]);
    expect(s).toMatchObject({ sessionName: '2026-2027', monthlyTotal: 5000, oneTimeTotal: 2000 });
    expect(s.items.map((i) => i.feeHeadName)).toEqual(['Admission fee', 'Tuition']);
    expect((await fees.structure(a, id.emptyClass, undefined)).items).toEqual([]);
  });

  it('sets, reads and removes a concession, per student and session', async () => {
    expect(await fees.concession(a, id.k1, undefined)).toBeNull();
    const c = await fees.setConcession(a, id.adminUser, id.k1, undefined, { kind: 'PERCENT', value: 20, reason: 'Sibling' });
    expect(c).toMatchObject({ studentId: id.k1, kind: 'PERCENT', value: 20, reason: 'Sibling' });
    expect(await fees.setConcession(a, id.adminUser, id.k1, undefined, { kind: 'PERCENT', value: 10 })).toMatchObject({ value: 10, reason: null }); // replaces, no second row
    expect(await owner.feeConcession.count({ where: { schoolId: a, studentId: id.k1 } })).toBe(1);
    await fees.setConcession(a, id.adminUser, id.k2, undefined, { kind: 'FIXED', value: 9000, reason: 'Staff child' }); // more than any bill: capped at the bill
    await expect(fees.setConcession(a, id.adminUser, id.bKid, undefined, { kind: 'PERCENT', value: 10 })).rejects.toMatchObject({ status: 404 });
    await fees.setConcession(a, id.adminUser, id.k3, undefined, { kind: 'FIXED', value: 100 });
    await fees.removeConcession(a, id.adminUser, id.k3, undefined);
    expect(await fees.concession(a, id.k3, undefined)).toBeNull();
    await expect(fees.removeConcession(a, id.adminUser, id.k3, undefined)).rejects.toMatchObject({ status: 404 });
  });

  it('refuses to generate without a structure, for a foreign class or a section of another class', async () => {
    const input = { period: '2026-10', dueDate: '2026-10-10' };
    await expect(fees.generate(a, id.adminUser, { ...input, classId: id.emptyClass })).rejects.toMatchObject({ status: 400 });
    await expect(fees.generate(a, id.adminUser, { ...input, classId: id.bClass })).rejects.toMatchObject({ status: 404 });
    await expect(fees.generate(a, id.adminUser, { ...input, classId: id.classId, sectionId: id.emptySection })).rejects.toMatchObject({ status: 404 });
  });

  it('generates one voucher per active student with concessions applied, and skips existing ones', async () => {
    const oct = await fees.generate(a, id.adminUser, { classId: id.classId, period: '2026-10', dueDate: '2026-10-10', includeOneTime: true });
    expect(oct).toMatchObject({ created: 3, skippedExisting: 0, students: 3 }); // the withdrawn student gets none
    expect(oct.totalBilled).toBe(6300 + 0 + 7000); // K1 7000 - 10 % | K2 fully covered | K3 full
    const again = await fees.generate(a, id.adminUser, { classId: id.classId, period: '2026-10', dueDate: '2026-10-10', includeOneTime: true });
    expect(again).toMatchObject({ created: 0, skippedExisting: 3 });
    const nov = await fees.generate(a, id.adminUser, { classId: id.classId, period: '2026-11', dueDate: '2026-11-10' }); // monthly lines only
    expect(nov).toMatchObject({ created: 3, totalBilled: 4500 + 0 + 5000 });

    const all = await fees.listVouchers(a, {});
    expect(all).toHaveLength(6);
    expect(new Set(all.map((v) => v.voucherNo)).size).toBe(6);
    expect(all.map((v) => v.voucherNo).sort()[0]).toBe('V-000001');
    const of = (studentId: string, period: string) => all.find((v) => v.student.id === studentId && v.period === period)!;
    expect(of(id.k1, '2026-10')).toMatchObject({ totalAmount: 7000, discountAmount: 700, netAmount: 6300, balance: 6300, status: 'UNPAID', overdue: true });
    expect(of(id.k2, '2026-10')).toMatchObject({ discountAmount: 7000, netAmount: 0, balance: 0, status: 'PAID', overdue: false }); // capped at the bill
    expect(of(id.k3, '2026-11')).toMatchObject({ totalAmount: 5000, balance: 5000, status: 'UNPAID', overdue: false }); // due after today
    id.k3Oct = of(id.k3, '2026-10').id;
    id.k3Nov = of(id.k3, '2026-11').id;
    id.k1Oct = of(id.k1, '2026-10').id;
    id.k2Oct = of(id.k2, '2026-10').id;
    const detail = await fees.getVoucher(a, id.k3Oct);
    expect(detail.items.map((i) => [i.description, i.amount]).sort()).toEqual([['Admission fee', 2000], ['Tuition', 5000]]);
  });

  it('keeps the voucher as billed when a concession changes afterwards', async () => {
    await fees.setConcession(a, id.adminUser, id.k3, undefined, { kind: 'PERCENT', value: 50 });
    expect((await fees.getVoucher(a, id.k3Oct)).discountAmount).toBe(0);
    await fees.removeConcession(a, id.adminUser, id.k3, undefined);
  });

  it('takes partial payments, refuses overpayment and double payment, and numbers receipts in order', async () => {
    const first = await fees.pay(a, id.adminUser, id.k3Oct, { amount: 3000, method: 'CASH' });
    expect(first).toMatchObject({ receiptNo: 'R-000001', amount: 3000, voided: false, period: '2026-10' });
    expect(await fees.getVoucher(a, id.k3Oct)).toMatchObject({ status: 'PARTIAL', paidAmount: 3000, balance: 4000 });
    await expect(fees.pay(a, id.adminUser, id.k3Oct, { amount: 4001, method: 'CASH' })).rejects.toMatchObject({ status: 400 });
    expect((await fees.getVoucher(a, id.k3Oct)).paidAmount).toBe(3000); // the refused payment left nothing behind
    const second = await fees.pay(a, id.adminUser, id.k3Oct, { amount: 4000, method: 'BANK', reference: 'SLIP-77' });
    expect(second).toMatchObject({ receiptNo: 'R-000002', reference: 'SLIP-77' });
    expect(await fees.getVoucher(a, id.k3Oct)).toMatchObject({ status: 'PAID', balance: 0, overdue: false });
    await expect(fees.pay(a, id.adminUser, id.k3Oct, { amount: 1, method: 'CASH' })).rejects.toMatchObject({ status: 409 });
    await expect(fees.pay(a, id.adminUser, id.k2Oct, { amount: 1, method: 'CASH' })).rejects.toMatchObject({ status: 409 }); // fully discounted, nothing to pay
    id.r1 = first.id;
    id.r2 = second.id;
    expect((await fees.getPayment(a, id.r2)).voucherNo).toBe((await fees.getVoucher(a, id.k3Oct)).voucherNo);
  });

  it('never double-books when two payments arrive together (row lock)', async () => {
    const results = await Promise.allSettled([
      fees.pay(a, id.adminUser, id.k1Oct, { amount: 5000, method: 'CASH' }),
      fees.pay(a, id.adminUser, id.k1Oct, { amount: 5000, method: 'CASH' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1); // 6300 owed: only one 5000 fits
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { status: 400 } });
    expect(await fees.getVoucher(a, id.k1Oct)).toMatchObject({ paidAmount: 5000, balance: 1300, status: 'PARTIAL' });
    const receipts = (await fees.getVoucher(a, id.k1Oct)).payments;
    expect(receipts).toHaveLength(1);
    id.k1Receipt = receipts[0]!.id;
  });

  it('cancels only a voucher without payments, and a cancelled voucher cannot be paid', async () => {
    await expect(fees.cancelVoucher(a, id.adminUser, id.k3Oct, 'Mistake')).rejects.toMatchObject({ status: 409 }); // has receipts
    const cancelled = await fees.cancelVoucher(a, id.adminUser, id.k3Nov, 'Left the school');
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelReason: 'Left the school', balance: 0, overdue: false });
    await expect(fees.cancelVoucher(a, id.adminUser, id.k3Nov, 'Again')).rejects.toMatchObject({ status: 409 });
    await expect(fees.pay(a, id.adminUser, id.k3Nov, { amount: 100, method: 'CASH' })).rejects.toMatchObject({ status: 409 });
  });

  it('voids a wrong receipt (kept, with a reason), reopens the voucher and never reuses the receipt number', async () => {
    const voided = await fees.voidPayment(a, id.adminUser, id.r1, 'Entered twice');
    expect(voided).toMatchObject({ receiptNo: 'R-000001', voided: true, voidReason: 'Entered twice' });
    expect(await fees.getVoucher(a, id.k3Oct)).toMatchObject({ status: 'PARTIAL', paidAmount: 4000, balance: 3000 });
    await expect(fees.voidPayment(a, id.adminUser, id.r1, 'Again')).rejects.toMatchObject({ status: 409 });
    expect(await owner.feePayment.count({ where: { schoolId: a, id: id.r1 } })).toBe(1); // still there
    await fees.voidPayment(a, id.adminUser, id.r2, 'Wrong student');
    expect(await fees.getVoucher(a, id.k3Oct)).toMatchObject({ status: 'UNPAID', paidAmount: 0, balance: 7000, overdue: true });
    const fresh = await fees.pay(a, id.adminUser, id.k3Oct, { amount: 2000, method: 'CASH' });
    expect(fresh.receiptNo).toBe('R-000004'); // 1 and 2 voided, 3 went to K1 above
    const detail = await fees.getVoucher(a, id.k3Oct);
    expect(detail.payments.map((p) => [p.receiptNo, p.voided]).sort()).toEqual([['R-000001', true], ['R-000002', true], ['R-000004', false]]);
  });

  it('filters vouchers by student, period, status, text and overdue', async () => {
    expect((await fees.listVouchers(a, { studentId: id.k1 })).map((v) => v.period).sort()).toEqual(['2026-10', '2026-11']);
    expect(await fees.listVouchers(a, { period: '2026-11' })).toHaveLength(3);
    expect((await fees.listVouchers(a, { status: 'CANCELLED' })).map((v) => v.id)).toEqual([id.k3Nov]);
    expect((await fees.listVouchers(a, { q: 'k2' })).every((v) => v.student.id === id.k2)).toBe(true);
    expect((await fees.listVouchers(a, { classId: id.emptyClass }))).toEqual([]);
    expect((await fees.listVouchers(a, { overdue: true })).map((v) => v.id).sort()).toEqual([id.k1Oct, id.k3Oct].sort()); // paid, cancelled and not-yet-due ones are out
  });

  it('reports collection, outstanding amounts and defaulters', async () => {
    const s = await fees.summary(a, undefined, undefined); // defaults to 1 Nov .. today
    expect(s).toMatchObject({ from: '2026-11-01', to: '2026-11-04', receipts: 2, collected: 7000 }); // K1 5000 + K3 2000; voided ones do not count
    expect(s.byMethod.every((m) => m.method === 'CASH')).toBe(true);
    // billed: Oct 6300 + 0 + 7000, Nov 4500 + 0 (K3 Nov is cancelled and ignored) = 17800
    expect(s).toMatchObject({ billed: 17800, totalCollected: 7000, balance: 10800, overdueBalance: 6300 - 5000 + 7000 - 2000 });
    expect((await fees.summary(a, '2026-10-01', '2026-10-31')).collected).toBe(0);
    const d = await fees.defaulters(a, undefined);
    expect(d.map((r) => [r.student.id, r.vouchers, r.balance, r.oldestDueDate])).toEqual([[id.k3, 1, 5000, '2026-10-10'], [id.k1, 1, 1300, '2026-10-10']]); // biggest debt first
    expect(await fees.defaulters(a, id.emptyClass)).toEqual([]);
  });

  it('writes an audit trail for money actions', async () => {
    const count = (action: string) => owner.auditLog.count({ where: { schoolId: a, action } });
    expect(await count('fee.payment.create')).toBe(4); // R-1, R-2, K1's one, R-4
    expect(await count('fee.payment.void')).toBe(2);
    expect(await count('fee.voucher.cancel')).toBe(1);
    expect(await count('fee.concession.set')).toBeGreaterThanOrEqual(3);
    expect(await count('fee.voucher.generate')).toBe(3);
  });

  it('never shows or changes another school\'s fees', async () => {
    await expect(fees.getVoucher(b, id.k3Oct)).rejects.toMatchObject({ status: 404 });
    await expect(fees.pay(b, id.bUser, id.k3Oct, { amount: 100, method: 'CASH' })).rejects.toMatchObject({ status: 404 });
    await expect(fees.cancelVoucher(b, id.bUser, id.k3Oct, 'Not mine')).rejects.toMatchObject({ status: 404 });
    await expect(fees.getPayment(b, id.r2)).rejects.toMatchObject({ status: 404 });
    await expect(fees.voidPayment(b, id.bUser, id.r2, 'Not mine')).rejects.toMatchObject({ status: 404 });
    expect(await fees.listVouchers(b, {})).toEqual([]);
    expect(await fees.defaulters(b, undefined)).toEqual([]);
    expect(await fees.summary(b, undefined, undefined)).toMatchObject({ collected: 0, billed: 0, receipts: 0 });
    expect((await fees.heads(b)).map((h) => h.name)).toEqual(['B tuition']);
    await expect(fees.concession(b, id.k1, undefined)).rejects.toMatchObject({ status: 400 }); // school B has no current academic session
    await expect(fees.concession(b, id.k1, id.session)).rejects.toMatchObject({ status: 404 }); // school A's session is invisible to school B

    const rows = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.school_id', ${b}, true)`;
      return { vouchers: await tx.feeVoucher.findMany(), payments: await tx.feePayment.findMany(), concessions: await tx.feeConcession.findMany() };
    });
    expect(rows.vouchers).toHaveLength(0);
    expect(rows.payments).toHaveLength(0);
    expect(rows.concessions).toHaveLength(0);
    expect(await owner.feeVoucher.count({ where: { schoolId: a } })).toBe(6);
  });
});
