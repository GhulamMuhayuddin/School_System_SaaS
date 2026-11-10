/**
 * Real database test of Phase 14 payroll. Needs the migration with leave_*, staff_salaries, payroll_runs, payslips and `pnpm db:rls`.
 * Run:  set RUN_DB_TESTS=1  then  pnpm --filter @nexora/api test
 * Worked numbers for October 2026 (31 days, a month always counts as 30 for the daily rate; today = 2026-11-04):
 *   Ahmed  gross 25,000 + 5,000 = 30,000, fixed deduction 1,500. 3 days ABSENT + 1 day of unpaid leave = 4 days -> 30,000 x 4 / 30 = 4,000. Net 24,500.
 *          With a bonus of 2,000 and another deduction of 500 the net is 26,000.  (a paid-type leave day and a hand-marked LEAVE day cost nothing)
 *   Bilal  joined 11 Oct: 10 days before joining -> 15,000 x 10 / 30 = 5,000. Net 10,000. (his ABSENT mark on 4 Oct is before joining and ignored)
 *   Dina   left 20 Oct: 11 days after leaving -> 12,000 x 11 / 30 = 4,400. Net 7,600. (her ABSENT mark on 25 Oct is ignored)
 *   Cara has no salary (listed as skipped); Esha joined in November (no payslip).
 * Run total with Ahmed's adjustments: gross 57,000, net 26,000 + 10,000 + 7,600 = 43,600.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PayrollService } from '../src/modules/payroll/payroll.service';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('payroll (PostgreSQL)', () => {
  let owner: PrismaClient; let runtime: PrismaClient; let svc: PayrollService;
  const tag = `pay-${Date.now()}`;
  let a = ''; let b = ''; let actor = '';
  const staff: Record<string, string> = {};
  let run = ''; const slip: Record<string, string> = {};
  const entry: Record<string, string> = {};
  const day = (s: string) => new Date(`${s}T00:00:00Z`);
  const slipOf = async (name: string) => (await svc.getRun(a, run)).payslips.find((s) => s.staff.name.startsWith(name))!;

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    svc = new PayrollService(runtime, () => new Date('2026-11-04T09:00:00Z'));
    a = (await owner.school.create({ data: { name: `${tag} A`, code: `${tag}-a` } })).id;
    b = (await owner.school.create({ data: { name: `${tag} B`, code: `${tag}-b` } })).id;
    const role = (await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'hr_manager' } })).id;
    actor = (await owner.user.create({ data: { schoolId: a, roleId: role, email: `${tag}@example.test`, passwordHash: 'x', firstName: 'Pay', lastName: 'Roll' } })).id;
    const mk = async (n: number, name: string, joining: string, extra: object = {}) => {
      staff[name] = (await owner.staff.create({
        data: { schoolId: a, employeeNo: `${tag}-${n}`, firstName: name, lastName: 'S', gender: 'MALE', phone: '0300-0000000', category: 'TEACHING', designation: 'Teacher', joiningDate: day(joining), ...extra },
      } as never)).id;
    };
    await mk(1, 'Ahmed', '2025-01-01');
    await mk(2, 'Bilal', '2026-10-11');
    await mk(3, 'Dina', '2025-01-01', { status: 'LEFT', leftAt: day('2026-10-20'), leftReason: 'Moved' });
    await mk(4, 'Cara', '2025-01-01');
    await mk(5, 'Esha', '2026-11-01');

    // October attendance
    const unpaidType = await owner.leaveType.create({ data: { schoolId: a, name: 'Unpaid', paid: false } });
    const paidType = await owner.leaveType.create({ data: { schoolId: a, name: 'Casual', yearlyQuota: 10, paid: true } });
    const req = (no: string, typeId: string, d: string) => owner.leaveRequest.create({ data: { schoolId: a, requestNo: no, staffId: staff.Ahmed, leaveTypeId: typeId, fromDate: day(d), toDate: day(d), days: 1, status: 'APPROVED' } });
    const unpaidReq = await req('L-U1', unpaidType.id, '2026-10-08');
    const paidReq = await req('L-P1', paidType.id, '2026-10-09');
    const att = (who: string, d: string, status: string, leaveRequestId: string | null = null) => owner.staffAttendance.create({ data: { schoolId: a, staffId: staff[who], date: day(d), status, leaveRequestId } as never });
    for (const d of ['2026-10-05', '2026-10-06', '2026-10-07']) await att('Ahmed', d, 'ABSENT');
    await att('Ahmed', '2026-10-08', 'LEAVE', unpaidReq.id);
    await att('Ahmed', '2026-10-09', 'LEAVE', paidReq.id);
    await att('Ahmed', '2026-10-12', 'PRESENT');
    await att('Ahmed', '2026-10-13', 'LEAVE'); // marked by hand, no request: stays paid
    await att('Bilal', '2026-10-04', 'ABSENT');
    await att('Dina', '2026-10-25', 'ABSENT');
  });
  afterAll(async () => {
    await owner.school.deleteMany({ where: { id: { in: [a, b] } } }).catch(() => {});
    await owner.$disconnect(); await runtime.$disconnect();
  });

  it('sets salaries; refuses nonsense and unknown staff; another school cannot touch them', async () => {
    const r = await svc.setSalary(a, actor, staff.Ahmed, { basic: 25000, allowances: 5000, fixedDeduction: 1500 });
    expect(r.salary).toMatchObject({ basic: 25000, allowances: 5000, fixedDeduction: 1500, gross: 30000 });
    await svc.setSalary(a, actor, staff.Bilal, { basic: 15000 });
    await svc.setSalary(a, actor, staff.Dina, { basic: 12000 });
    await svc.setSalary(a, actor, staff.Esha, { basic: 10000 });
    await expect(svc.setSalary(a, actor, staff.Ahmed, { basic: 1000, fixedDeduction: 5000 })).rejects.toMatchObject({ status: 400 });
    await expect(svc.setSalary(a, actor, '00000000-0000-4000-8000-000000000000', { basic: 1000 })).rejects.toMatchObject({ status: 404 });
    await expect(svc.setSalary(b, actor, staff.Ahmed, { basic: 1000 })).rejects.toMatchObject({ status: 404 });
    const missing = await svc.listSalaries(a, { missing: true });
    expect(missing.rows.map((x) => x.staff.name)).toEqual(['Cara S']); // Dina has left, so only active staff are listed
    expect((await svc.listSalaries(a, { q: 'ahm' })).rows).toHaveLength(1);
  });

  it('makes the October run from salary, joining/leaving dates and attendance', async () => {
    await expect(svc.createRun(a, actor, '2026-12')).rejects.toMatchObject({ status: 400 }); // not started yet
    const r = await svc.createRun(a, actor, '2026-10');
    run = r.id;
    expect(r.status).toBe('DRAFT');
    expect(r.payslips.map((s) => [s.staff.name, s.slipNo, s.net])).toEqual([['Ahmed S', 'P-000001', 24500], ['Bilal S', 'P-000002', 10000], ['Dina S', 'P-000003', 7600]]);
    const ahmed = r.payslips[0];
    expect(ahmed).toMatchObject({ gross: 30000, absentDays: 3, unpaidLeaveDays: 1, outsideDays: 0, deductionDays: 4, attendanceDeduction: 4000, fixedDeduction: 1500 });
    expect(r.payslips[1]).toMatchObject({ outsideDays: 10, absentDays: 0, attendanceDeduction: 5000 });
    expect(r.payslips[2]).toMatchObject({ outsideDays: 11, absentDays: 0, attendanceDeduction: 4400 });
    expect(r.skipped.map((s) => s.name)).toEqual(['Cara S']);
    expect(r.totals).toMatchObject({ slips: 3, gross: 57000, net: 42100, paidSlips: 0, unpaidAmount: 42100 });
    await expect(svc.createRun(a, actor, '2026-10')).rejects.toMatchObject({ status: 409 });
    for (const s of r.payslips) slip[s.staff.name.split(' ')[0]] = s.id;
  });

  it('adjusts a payslip (bonus, other deduction); refuses deductions bigger than the pay', async () => {
    const s = await svc.updateSlip(a, actor, slip.Ahmed, { bonus: 2000, otherDeduction: 500, note: 'Exam duty bonus' });
    expect(s).toMatchObject({ bonus: 2000, otherDeduction: 500, net: 26000, note: 'Exam duty bonus' });
    await expect(svc.updateSlip(a, actor, slip.Ahmed, { otherDeduction: 40000 })).rejects.toMatchObject({ status: 400 });
    expect((await slipOf('Ahmed')).net).toBe(26000); // unchanged after the refusal
  });

  it('recalculates a draft from the latest attendance and keeps the adjustments and slip numbers', async () => {
    const extra = await owner.staffAttendance.create({ data: { schoolId: a, staffId: staff.Ahmed, date: day('2026-10-14'), status: 'ABSENT' } });
    let r = await svc.regenerate(a, actor, run);
    expect(r.payslips.find((x) => x.staff.name.startsWith('Ahmed'))).toMatchObject({ slipNo: 'P-000001', absentDays: 4, deductionDays: 5, attendanceDeduction: 5000, bonus: 2000, otherDeduction: 500, net: 25000 });
    await owner.staffAttendance.delete({ where: { id: extra.id } });
    r = await svc.regenerate(a, actor, run);
    expect(r.payslips.find((x) => x.staff.name.startsWith('Ahmed'))!.net).toBe(26000);
    expect(r.totals).toMatchObject({ gross: 57000, net: 43600 });
    expect(r.payslips).toHaveLength(3);
  });

  it('a draft cannot be paid; a finalized run cannot be edited', async () => {
    await expect(svc.pay(a, actor, slip.Ahmed, { method: 'CASH' })).rejects.toMatchObject({ status: 409 });
    const f = await svc.finalize(a, actor, run);
    expect(f.status).toBe('FINALIZED'); expect(f.finalizedAt).not.toBeNull(); expect(f.skipped).toEqual([]);
    await expect(svc.updateSlip(a, actor, slip.Ahmed, { bonus: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(svc.regenerate(a, actor, run)).rejects.toMatchObject({ status: 409 });
    await expect(svc.deleteRun(a, actor, run)).rejects.toMatchObject({ status: 409 });
    await expect(svc.finalize(a, actor, run)).rejects.toMatchObject({ status: 409 });
  });

  it('paying writes a salary expense into Accounts; no double payment; no future date', async () => {
    const p = await svc.pay(a, actor, slip.Ahmed, { method: 'CASH', paidOn: '2026-11-04' });
    expect(p).toMatchObject({ paid: true, paidOn: '2026-11-04', method: 'CASH', accountEntryNo: 'EXP-000001', paymentVoided: false });
    const e = await owner.accountEntry.findFirstOrThrow({ where: { schoolId: a, entryNo: 'EXP-000001' }, include: { category: true } });
    expect(e).toMatchObject({ amount: 26000, kind: 'EXPENSE', reference: 'P-000001', party: 'Ahmed S', voidedAt: null });
    expect(e.category.name).toBe('Salaries');
    expect(e.description).toBe(`Salary 2026-10 - Ahmed S (${tag}-1)`);
    entry.ahmed1 = e.id;
    await expect(svc.pay(a, actor, slip.Ahmed, { method: 'CASH' })).rejects.toMatchObject({ status: 409 });
    await expect(svc.pay(a, actor, slip.Bilal, { method: 'BANK', paidOn: '2026-11-05' })).rejects.toMatchObject({ status: 400 });
    const bil = await svc.pay(a, actor, slip.Bilal, { method: 'BANK' });
    expect(bil).toMatchObject({ paid: true, paidOn: '2026-11-04', accountEntryNo: 'EXP-000002' });
    await owner.accountCategory.updateMany({ where: { schoolId: a, name: 'Salaries' }, data: { isActive: false } });
    await expect(svc.pay(a, actor, slip.Dina, { method: 'CASH' })).rejects.toMatchObject({ status: 400 });
    await owner.accountCategory.updateMany({ where: { schoolId: a, name: 'Salaries' }, data: { isActive: true } });
    const runs = await svc.listRuns(a);
    expect(runs.find((r) => r.id === run)!.totals).toMatchObject({ slips: 3, net: 43600, paidSlips: 2, paidAmount: 36000, unpaidAmount: 7600 });
  });

  it('a run with paid payslips cannot be reopened; voiding a payment reverses the ledger entry and allows paying again', async () => {
    await expect(svc.reopen(a, actor, run)).rejects.toMatchObject({ status: 409 });
    await expect(svc.voidPayment(a, actor, slip.Dina, 'Not paid at all')).rejects.toMatchObject({ status: 409 });
    const v = await svc.voidPayment(a, actor, slip.Bilal, 'Wrong bank account');
    expect(v).toMatchObject({ paid: false, paidOn: null, method: null });
    const old = await owner.accountEntry.findFirstOrThrow({ where: { schoolId: a, entryNo: 'EXP-000002' } });
    expect(old.voidedAt).not.toBeNull(); expect(old.voidReason).toContain('Wrong bank account');
    const again = await svc.pay(a, actor, slip.Bilal, { method: 'CASH' });
    expect(again.accountEntryNo).toBe('EXP-000003'); // a new number, the voided one is never reused
    expect((await svc.listRuns(a)).find((r) => r.id === run)!.totals.paidSlips).toBe(2);
  });

  it('if Accounts voids the salary entry itself, the payslip shows it as unpaid and can be paid again', async () => {
    await owner.accountEntry.update({ where: { id: entry.ahmed1 }, data: { voidedAt: new Date('2026-11-04T10:00:00Z'), voidReason: 'Entered twice' } });
    const s = await slipOf('Ahmed');
    expect(s).toMatchObject({ paid: false, paymentVoided: true });
    expect((await svc.listRuns(a)).find((r) => r.id === run)!.totals).toMatchObject({ paidSlips: 1, paidAmount: 10000, unpaidAmount: 33600 });
    await svc.voidPayment(a, actor, slip.Ahmed, 'Cleaning up'); // already voided in Accounts: only the payslip is cleared
    const re = await svc.pay(a, actor, slip.Ahmed, { method: 'BANK' });
    expect(re).toMatchObject({ paid: true, accountEntryNo: 'EXP-000004', paymentVoided: false });
    const live = await owner.accountEntry.findMany({ where: { schoolId: a, voidedAt: null } });
    expect(live.map((x) => x.amount).sort((x, y) => x - y)).toEqual([10000, 26000]); // Bilal 10,000 + Ahmed 26,000
  });

  it('after every payment is voided the run can be reopened; staff see only their own FINALIZED payslips', async () => {
    await svc.voidPayment(a, actor, slip.Ahmed, 'Re-doing the run');
    await svc.voidPayment(a, actor, slip.Bilal, 'Re-doing the run');
    const user = await owner.user.create({ data: { schoolId: a, roleId: (await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'teacher' } })).id, email: `${tag}-ahmed@example.test`, passwordHash: 'x', firstName: 'Ahmed', lastName: 'U' } });
    await owner.staff.update({ where: { id: staff.Ahmed }, data: { userId: user.id } });
    expect((await svc.mySlips(a, user.id))).toHaveLength(1); // still finalized
    const r = await svc.reopen(a, actor, run);
    expect(r.status).toBe('DRAFT');
    expect(await svc.mySlips(a, user.id)).toEqual([]); // a draft is not shown to staff
    await svc.finalize(a, actor, run);
    const mine = await svc.mySlips(a, user.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ slipNo: 'P-000001', period: '2026-10', net: 26000, paid: false });
    expect(await svc.mySlips(a, actor)).toEqual([]); // the HR user is not a staff member
  });

  it('draft runs can be deleted; another school sees none of this', async () => {
    const sep = await svc.createRun(a, actor, '2026-09'); // Ahmed and Dina worked in September; Bilal and Esha had not joined
    expect(sep.payslips.map((s) => s.staff.name)).toEqual(['Ahmed S', 'Dina S']);
    await svc.deleteRun(a, actor, sep.id);
    await expect(svc.getRun(a, sep.id)).rejects.toMatchObject({ status: 404 });
    expect(await svc.listRuns(b)).toEqual([]);
    await expect(svc.getRun(b, run)).rejects.toMatchObject({ status: 404 });
    await expect(svc.pay(b, actor, slip.Ahmed, { method: 'CASH' })).rejects.toMatchObject({ status: 404 });
  });

  it('a payslip can be fetched for printing with the school header; staff only get their own finalized one', async () => {
    const d = await svc.getSlip(a, slip.Ahmed);
    expect(d.payslip).toMatchObject({ slipNo: 'P-000001', period: '2026-10', net: 26000 });
    expect(d.school.name).toBe(`${tag} A`);
    const user = (await owner.staff.findFirstOrThrow({ where: { id: staff.Ahmed } })).userId!;
    expect((await svc.mySlip(a, user, slip.Ahmed)).payslip.slipNo).toBe('P-000001');
    await expect(svc.mySlip(a, user, slip.Bilal)).rejects.toMatchObject({ status: 404 }); // somebody else's
    await expect(svc.mySlip(a, actor, slip.Ahmed)).rejects.toMatchObject({ status: 404 }); // not a staff member
    await expect(svc.getSlip(b, slip.Ahmed)).rejects.toMatchObject({ status: 404 });
  });
});
