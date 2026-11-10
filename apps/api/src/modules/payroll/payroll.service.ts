import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { counterKey, formatEntryNo } from '../accounts/accounts.logic';
import {
  SALARY_CATEGORY, SLIP_COUNTER, computeSlip, countUnpaid, employedInMonth, monthRange, outsideDays, runTotals, slipNo, MONTH_DIVISOR,
  type AttendanceRow,
} from './payroll.logic';
import type {
  PayInput, PayMethod, PayrollApi, PayslipDetail, PayslipDto, RunDetailDto, RunStatus, RunSummaryDto, SalaryDto, SalaryFilter, SalaryInput, SalaryRow, SlipPatch,
} from './payroll.types';

type Tx = Prisma.TransactionClient;
const LIST_LIMIT = 1000;
const RUN_LIMIT = 60;
const dayText = (d: Date): string => d.toISOString().slice(0, 10);
const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);
const blank = (v: string | null | undefined): string | null => (v === undefined || v === null || v.trim() === '' ? null : v.trim());
const fullName = (p: { firstName: string; lastName: string }): string => `${p.firstName} ${p.lastName}`;

type SlipRow = Prisma.PayslipGetPayload<{ include: { run: { select: { period: true; status: true } } } }>;
type Entry = { entryNo: string; voided: boolean };
interface Eligible {
  staff: { id: string; employeeNo: string; firstName: string; lastName: string; designation: string };
  salary: { basic: number; allowances: number; fixedDeduction: number };
  absentDays: number; unpaidLeaveDays: number; outside: number;
}

/** Salaries, monthly payroll runs and payslips. Paying a payslip writes an EXPENSE entry (category Salaries) into the accounts ledger. */
export class PayrollService implements PayrollApi {
  constructor(private readonly prisma: PrismaClient, private readonly now: () => Date = () => new Date()) {}

  private today(): string { return dayText(this.now()); }

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string | null, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: 'payroll', entityId, metadata } });
  }

  /** Reserves `count` consecutive numbers of a school counter and returns the first one. */
  private async reserve(tx: Tx, schoolId: string, key: string, count: number): Promise<number> {
    const c = await tx.schoolCounter.upsert({
      where: { schoolId_key: { schoolId, key } }, update: { value: { increment: count } }, create: { schoolId, key, value: count },
    });
    return c.value - count + 1;
  }

  private lockSlip(tx: Tx, id: string): Promise<unknown> {
    return tx.$queryRaw`SELECT id FROM payslips WHERE id = ${id}::uuid FOR UPDATE`;
  }

  private lockRun(tx: Tx, id: string): Promise<unknown> {
    return tx.$queryRaw`SELECT id FROM payroll_runs WHERE id = ${id}::uuid FOR UPDATE`;
  }

  /** Salary entries behind paid payslips: number and whether Accounts has voided it since. */
  private async entriesFor(tx: Tx, schoolId: string, slips: { accountEntryId: string | null }[]): Promise<Map<string, Entry>> {
    const ids = slips.map((s) => s.accountEntryId).filter((v): v is string => v !== null);
    const map = new Map<string, Entry>();
    if (ids.length === 0) return map;
    const rows = await tx.accountEntry.findMany({ where: { schoolId, id: { in: ids } }, select: { id: true, entryNo: true, voidedAt: true } });
    for (const e of rows) map.set(e.id, { entryNo: e.entryNo, voided: e.voidedAt !== null });
    return map;
  }

  private slipDto(s: SlipRow, entries: Map<string, Entry>): PayslipDto {
    const entry = s.accountEntryId ? entries.get(s.accountEntryId) : undefined;
    const paid = s.paidAt !== null && !(entry?.voided ?? false);
    return {
      id: s.id, slipNo: s.slipNo, runId: s.runId, period: s.run.period, staff: { id: s.staffId, employeeNo: s.employeeNo, name: s.staffName, designation: s.designation },
      basic: s.basic, allowances: s.allowances, fixedDeduction: s.fixedDeduction, absentDays: s.absentDays, unpaidLeaveDays: s.unpaidLeaveDays, outsideDays: s.outsideDays,
      deductionDays: Math.min(MONTH_DIVISOR, s.absentDays + s.unpaidLeaveDays + s.outsideDays), attendanceDeduction: s.attendanceDeduction, bonus: s.bonus,
      otherDeduction: s.otherDeduction, note: s.note, gross: s.gross, net: s.net, paid, paidOn: paid && s.paidOn ? dayText(s.paidOn) : null,
      method: paid ? (s.method as PayMethod | null) : null, accountEntryNo: entry?.entryNo ?? null, paymentVoided: s.paidAt !== null && (entry?.voided ?? false),
    };
  }

  private async slipById(tx: Tx, schoolId: string, id: string): Promise<PayslipDto> {
    const s = await tx.payslip.findFirst({ where: { id, schoolId }, include: { run: { select: { period: true, status: true } } } });
    if (!s) throw notFound('Payslip not found');
    return this.slipDto(s, await this.entriesFor(tx, schoolId, [s]));
  }

  // ---- salaries --------------------------------------------------------------------------------------------------------
  private salaryDto(s: { basic: number; allowances: number; fixedDeduction: number; notes: string | null }): SalaryDto {
    return { basic: s.basic, allowances: s.allowances, fixedDeduction: s.fixedDeduction, gross: s.basic + s.allowances, notes: s.notes };
  }

  listSalaries(schoolId: string, filter: SalaryFilter): Promise<{ rows: SalaryRow[]; truncated: boolean }> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const q = filter.q?.trim();
      const staff = await tx.staff.findMany({
        where: {
          schoolId, deletedAt: null, status: 'ACTIVE', ...(filter.missing ? { salary: { is: null } } : {}),
          ...(q ? { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { employeeNo: { contains: q, mode: 'insensitive' } }] } : {}),
        },
        include: { salary: true }, orderBy: { employeeNo: 'asc' }, take: LIST_LIMIT + 1,
      });
      return {
        rows: staff.slice(0, LIST_LIMIT).map((s) => ({
          staff: { id: s.id, employeeNo: s.employeeNo, name: fullName(s), designation: s.designation, category: s.category }, salary: s.salary ? this.salaryDto(s.salary) : null,
        })),
        truncated: staff.length > LIST_LIMIT,
      };
    });
  }

  setSalary(schoolId: string, actorId: string, staffId: string, input: SalaryInput): Promise<SalaryRow> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const s = await tx.staff.findFirst({ where: { id: staffId, schoolId, deletedAt: null }, include: { salary: true } });
      if (!s) throw notFound('Staff member not found');
      const allowances = input.allowances ?? 0;
      const fixedDeduction = input.fixedDeduction ?? 0;
      if (fixedDeduction > input.basic + allowances) throw badRequest('The fixed deduction cannot be more than the gross salary');
      const saved = await tx.staffSalary.upsert({
        where: { staffId },
        update: { basic: input.basic, allowances, fixedDeduction, notes: blank(input.notes), updatedById: actorId },
        create: { schoolId, staffId, basic: input.basic, allowances, fixedDeduction, notes: blank(input.notes), updatedById: actorId },
      });
      await this.audit(tx, schoolId, actorId, 'payroll.salary.set', staffId, {
        employeeNo: s.employeeNo, before: s.salary ? { basic: s.salary.basic, allowances: s.salary.allowances, fixedDeduction: s.salary.fixedDeduction } : null,
        after: { basic: saved.basic, allowances: saved.allowances, fixedDeduction: saved.fixedDeduction },
      });
      return { staff: { id: s.id, employeeNo: s.employeeNo, name: fullName(s), designation: s.designation, category: s.category }, salary: this.salaryDto(saved) };
    });
  }

  // ---- runs ------------------------------------------------------------------------------------------------------------
  private runSummary(r: { id: string; period: string; status: string; createdAt: Date; finalizedAt: Date | null }, slips: { gross: number; net: number; paid: boolean }[]): RunSummaryDto {
    return { id: r.id, period: r.period, status: r.status as RunStatus, createdAt: r.createdAt.toISOString(), finalizedAt: r.finalizedAt ? r.finalizedAt.toISOString() : null, totals: runTotals(slips) };
  }

  listRuns(schoolId: string): Promise<RunSummaryDto[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const runs = await tx.payrollRun.findMany({
        where: { schoolId }, orderBy: { period: 'desc' }, take: RUN_LIMIT,
        include: { payslips: { select: { gross: true, net: true, paidAt: true, accountEntryId: true } } },
      });
      const entries = await this.entriesFor(tx, schoolId, runs.flatMap((r) => r.payslips));
      return runs.map((r) => this.runSummary(r, r.payslips.map((s) => ({ gross: s.gross, net: s.net, paid: s.paidAt !== null && !(s.accountEntryId && entries.get(s.accountEntryId)?.voided) }))));
    });
  }

  private async runDetail(tx: Tx, schoolId: string, id: string): Promise<RunDetailDto> {
    const r = await tx.payrollRun.findFirst({ where: { id, schoolId }, include: { payslips: { include: { run: { select: { period: true, status: true } } }, orderBy: { employeeNo: 'asc' } } } });
    if (!r) throw notFound('Payroll run not found');
    const entries = await this.entriesFor(tx, schoolId, r.payslips);
    const slips = r.payslips.map((s) => this.slipDto(s, entries));
    // Staff without a salary are only worth listing while the run can still be recalculated.
    const skipped = r.status === 'DRAFT' ? (await this.prepare(tx, schoolId, r.period)).skipped : [];
    return { ...this.runSummary(r, slips), payslips: slips, skipped };
  }

  getRun(schoolId: string, id: string): Promise<RunDetailDto> {
    return tenantTransaction(this.prisma, schoolId, (tx) => this.runDetail(tx, schoolId, id));
  }

  /** Who is paid for this month, with the figures worked out from salary, joining/leaving dates and staff attendance. */
  private async prepare(tx: Tx, schoolId: string, period: string): Promise<{ eligible: Eligible[]; skipped: { id: string; employeeNo: string; name: string }[] }> {
    const { first, last } = monthRange(period);
    const staff = await tx.staff.findMany({ where: { schoolId, deletedAt: null }, include: { salary: true }, orderBy: { employeeNo: 'asc' } });
    const inMonth = staff.filter((s) => employedInMonth(period, dayText(s.joiningDate), s.leftAt ? dayText(s.leftAt) : null));
    const withSalary = inMonth.filter((s) => s.salary !== null);
    const skipped = inMonth.filter((s) => s.salary === null).map((s) => ({ id: s.id, employeeNo: s.employeeNo, name: fullName(s) }));
    const att = withSalary.length === 0 ? [] : await tx.staffAttendance.findMany({
      where: { schoolId, staffId: { in: withSalary.map((s) => s.id) }, date: { gte: toDate(first), lte: toDate(last) } },
      select: { staffId: true, date: true, status: true, leaveRequest: { select: { leaveType: { select: { paid: true } } } } },
    });
    const byStaff = new Map<string, AttendanceRow[]>();
    for (const a of att) {
      const list = byStaff.get(a.staffId) ?? [];
      list.push({ date: dayText(a.date), status: a.status, leavePaid: a.leaveRequest ? a.leaveRequest.leaveType.paid : null });
      byStaff.set(a.staffId, list);
    }
    const eligible = withSalary.map((s) => {
      const joined = dayText(s.joiningDate);
      const left = s.leftAt ? dayText(s.leftAt) : null;
      const counts = countUnpaid(byStaff.get(s.id) ?? [], period, joined, left);
      return { staff: s, salary: s.salary!, absentDays: counts.absentDays, unpaidLeaveDays: counts.unpaidLeaveDays, outside: outsideDays(period, joined, left) };
    });
    return { eligible, skipped };
  }

  private figures(e: Eligible, bonus: number, otherDeduction: number) {
    const f = computeSlip({
      basic: e.salary.basic, allowances: e.salary.allowances, fixedDeduction: e.salary.fixedDeduction, bonus, otherDeduction,
      absentDays: e.absentDays, unpaidLeaveDays: e.unpaidLeaveDays, outsideDays: e.outside,
    });
    return {
      staffName: fullName(e.staff), employeeNo: e.staff.employeeNo, designation: e.staff.designation, basic: e.salary.basic, allowances: e.salary.allowances,
      fixedDeduction: e.salary.fixedDeduction, absentDays: e.absentDays, unpaidLeaveDays: e.unpaidLeaveDays, outsideDays: e.outside,
      attendanceDeduction: f.attendanceDeduction, gross: f.gross, net: f.net,
    };
  }

  createRun(schoolId: string, actorId: string, period: string): Promise<RunDetailDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      if (period > this.today().slice(0, 7)) throw badRequest('Payroll cannot be made for a month that has not started');
      if (await tx.payrollRun.findFirst({ where: { schoolId, period }, select: { id: true } })) throw conflict(`Payroll for ${period} already exists`);
      const { eligible, skipped } = await this.prepare(tx, schoolId, period);
      if (eligible.length === 0) {
        throw badRequest(skipped.length > 0 ? 'No staff member who worked in this month has a salary set yet' : 'No staff member worked in this month', { skipped: skipped.length });
      }
      const run = await tx.payrollRun.create({ data: { schoolId, period, createdById: actorId } });
      const first = await this.reserve(tx, schoolId, SLIP_COUNTER, eligible.length);
      await tx.payslip.createMany({
        data: eligible.map((e, i) => ({ schoolId, runId: run.id, staffId: e.staff.id, slipNo: slipNo(first + i), ...this.figures(e, 0, 0) })),
      });
      await this.audit(tx, schoolId, actorId, 'payroll.run.create', run.id, { period, slips: eligible.length, skipped: skipped.length });
      return this.runDetail(tx, schoolId, run.id);
    });
  }

  private async draftRun(tx: Tx, schoolId: string, id: string) {
    await this.lockRun(tx, id);
    const run = await tx.payrollRun.findFirst({ where: { id, schoolId } });
    if (!run) throw notFound('Payroll run not found');
    if (run.status !== 'DRAFT') throw conflict('This payroll is finalized. Reopen it first to change it');
    return run;
  }

  regenerate(schoolId: string, actorId: string, id: string): Promise<RunDetailDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const run = await this.draftRun(tx, schoolId, id);
      const { eligible } = await this.prepare(tx, schoolId, run.period);
      const existing = await tx.payslip.findMany({ where: { schoolId, runId: id } });
      const byStaff = new Map<string, (typeof existing)[number]>(existing.map((s) => [s.staffId, s] as const));
      const keep = new Set(eligible.map((e) => e.staff.id));
      const gone = existing.filter((s) => !keep.has(s.staffId)).map((s) => s.id);
      if (gone.length > 0) await tx.payslip.deleteMany({ where: { schoolId, id: { in: gone } } });
      const fresh = eligible.filter((e) => !byStaff.has(e.staff.id));
      const first = fresh.length > 0 ? await this.reserve(tx, schoolId, SLIP_COUNTER, fresh.length) : 0;
      let next = first;
      for (const e of eligible) {
        const old = byStaff.get(e.staff.id);
        if (old) await tx.payslip.update({ where: { id: old.id }, data: this.figures(e, old.bonus, old.otherDeduction) });
        else await tx.payslip.create({ data: { schoolId, runId: id, staffId: e.staff.id, slipNo: slipNo(next++), ...this.figures(e, 0, 0) } });
      }
      await this.audit(tx, schoolId, actorId, 'payroll.run.regenerate', id, { period: run.period, slips: eligible.length, removed: gone.length });
      return this.runDetail(tx, schoolId, id);
    });
  }

  deleteRun(schoolId: string, actorId: string, id: string): Promise<void> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const run = await this.draftRun(tx, schoolId, id);
      await tx.payrollRun.delete({ where: { id } });
      await this.audit(tx, schoolId, actorId, 'payroll.run.delete', id, { period: run.period });
    });
  }

  finalize(schoolId: string, actorId: string, id: string): Promise<RunDetailDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const run = await this.draftRun(tx, schoolId, id);
      const count = await tx.payslip.count({ where: { schoolId, runId: id } });
      if (count === 0) throw badRequest('There are no payslips to finalize');
      await tx.payrollRun.update({ where: { id }, data: { status: 'FINALIZED', finalizedAt: this.now(), finalizedById: actorId } });
      await this.audit(tx, schoolId, actorId, 'payroll.run.finalize', id, { period: run.period, slips: count });
      return this.runDetail(tx, schoolId, id);
    });
  }

  reopen(schoolId: string, actorId: string, id: string): Promise<RunDetailDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await this.lockRun(tx, id);
      const run = await tx.payrollRun.findFirst({ where: { id, schoolId }, include: { payslips: { select: { id: true, paidAt: true, accountEntryId: true } } } });
      if (!run) throw notFound('Payroll run not found');
      if (run.status !== 'FINALIZED') throw conflict('This payroll is not finalized');
      const entries = await this.entriesFor(tx, schoolId, run.payslips);
      const stillPaid = run.payslips.filter((s) => s.paidAt !== null && !(s.accountEntryId && entries.get(s.accountEntryId)?.voided)).length;
      if (stillPaid > 0) throw conflict(`${stillPaid} payslip(s) are already paid. Void those payments first`);
      await tx.payrollRun.update({ where: { id }, data: { status: 'DRAFT', finalizedAt: null, finalizedById: null } });
      await this.audit(tx, schoolId, actorId, 'payroll.run.reopen', id, { period: run.period });
      return this.runDetail(tx, schoolId, id);
    });
  }

  // ---- payslips --------------------------------------------------------------------------------------------------------
  updateSlip(schoolId: string, actorId: string, slipId: string, patch: SlipPatch): Promise<PayslipDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await this.lockSlip(tx, slipId);
      const s = await tx.payslip.findFirst({ where: { id: slipId, schoolId }, include: { run: { select: { period: true, status: true } } } });
      if (!s) throw notFound('Payslip not found');
      if (s.run.status !== 'DRAFT') throw conflict('This payroll is finalized. Reopen it first to change a payslip');
      const bonus = patch.bonus ?? s.bonus;
      const otherDeduction = patch.otherDeduction ?? s.otherDeduction;
      const f = computeSlip({ basic: s.basic, allowances: s.allowances, fixedDeduction: s.fixedDeduction, bonus, otherDeduction, absentDays: s.absentDays, unpaidLeaveDays: s.unpaidLeaveDays, outsideDays: s.outsideDays });
      if (f.rawNet < 0) throw badRequest('The deductions are more than the pay');
      await tx.payslip.update({ where: { id: slipId }, data: { bonus, otherDeduction, net: f.net, ...(patch.note !== undefined ? { note: blank(patch.note) } : {}) } });
      await this.audit(tx, schoolId, actorId, 'payroll.slip.update', slipId, { slipNo: s.slipNo, bonus, otherDeduction, net: f.net });
      return this.slipById(tx, schoolId, slipId);
    });
  }

  pay(schoolId: string, actorId: string, slipId: string, input: PayInput): Promise<PayslipDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await this.lockSlip(tx, slipId);
      const s = await tx.payslip.findFirst({ where: { id: slipId, schoolId }, include: { run: { select: { period: true, status: true } } } });
      if (!s) throw notFound('Payslip not found');
      if (s.run.status !== 'FINALIZED') throw conflict('Finalize the payroll before paying');
      const entries = await this.entriesFor(tx, schoolId, [s]);
      if (this.slipDto(s, entries).paid) throw conflict('This payslip is already paid');
      if (s.net <= 0) throw badRequest('There is nothing to pay on this payslip');
      const paidOn = input.paidOn ?? this.today();
      if (paidOn > this.today()) throw badRequest('The payment date cannot be in the future');

      let cat = await tx.accountCategory.findFirst({ where: { schoolId, kind: 'EXPENSE', name: { equals: SALARY_CATEGORY, mode: 'insensitive' } } });
      if (!cat) cat = await tx.accountCategory.create({ data: { schoolId, kind: 'EXPENSE', name: SALARY_CATEGORY } });
      if (!cat.isActive) throw badRequest(`The "${cat.name}" category is inactive. Turn it on in Accounts first`);

      const n = await this.reserve(tx, schoolId, counterKey('EXPENSE'), 1);
      const entry = await tx.accountEntry.create({
        data: {
          schoolId, entryNo: formatEntryNo('EXPENSE', n), kind: 'EXPENSE', categoryId: cat.id, amount: s.net, method: input.method, entryDate: toDate(paidOn),
          description: `Salary ${s.run.period} - ${s.staffName} (${s.employeeNo})`, party: s.staffName, reference: s.slipNo, createdById: actorId,
        },
      });
      await tx.payslip.update({ where: { id: slipId }, data: { paidAt: this.now(), paidOn: toDate(paidOn), method: input.method, accountEntryId: entry.id, paidById: actorId } });
      await this.audit(tx, schoolId, actorId, 'payroll.slip.pay', slipId, { slipNo: s.slipNo, net: s.net, method: input.method, entryNo: entry.entryNo });
      return this.slipById(tx, schoolId, slipId);
    });
  }

  voidPayment(schoolId: string, actorId: string, slipId: string, reason: string): Promise<PayslipDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await this.lockSlip(tx, slipId);
      const s = await tx.payslip.findFirst({ where: { id: slipId, schoolId }, include: { run: { select: { period: true, status: true } } } });
      if (!s) throw notFound('Payslip not found');
      if (s.paidAt === null) throw conflict('This payslip is not paid');
      if (s.accountEntryId) {
        const e = await tx.accountEntry.findFirst({ where: { id: s.accountEntryId, schoolId }, select: { id: true, voidedAt: true } });
        if (e && e.voidedAt === null) {
          await tx.accountEntry.update({ where: { id: e.id }, data: { voidedAt: this.now(), voidReason: `Salary payment reversed: ${reason}`, voidedById: actorId } });
        }
      }
      await tx.payslip.update({ where: { id: slipId }, data: { paidAt: null, paidOn: null, method: null, accountEntryId: null, paidById: null } });
      await this.audit(tx, schoolId, actorId, 'payroll.slip.void', slipId, { slipNo: s.slipNo, net: s.net, reason });
      return this.slipById(tx, schoolId, slipId);
    });
  }

  private async header(tx: Tx, schoolId: string) {
    const school = await tx.school.findFirst({ where: { id: schoolId }, select: { name: true, address: true, city: true, phone: true, email: true } });
    return school ?? { name: '', address: null, city: null, phone: null, email: null };
  }

  getSlip(schoolId: string, id: string): Promise<PayslipDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => ({ payslip: await this.slipById(tx, schoolId, id), school: await this.header(tx, schoolId) }));
  }

  mySlip(schoolId: string, userId: string, id: string): Promise<PayslipDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const me = await tx.staff.findFirst({ where: { schoolId, userId, deletedAt: null }, select: { id: true } });
      const own = me ? await tx.payslip.findFirst({ where: { id, schoolId, staffId: me.id, run: { status: 'FINALIZED' } }, select: { id: true } }) : null;
      if (!own) throw notFound('Payslip not found');
      return { payslip: await this.slipById(tx, schoolId, id), school: await this.header(tx, schoolId) };
    });
  }

  mySlips(schoolId: string, userId: string): Promise<PayslipDto[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const me = await tx.staff.findFirst({ where: { schoolId, userId, deletedAt: null }, select: { id: true } });
      if (!me) return [];
      const rows = await tx.payslip.findMany({
        where: { schoolId, staffId: me.id, run: { status: 'FINALIZED' } }, include: { run: { select: { period: true, status: true } } }, orderBy: { run: { period: 'desc' } }, take: 36,
      });
      const entries = await this.entriesFor(tx, schoolId, rows);
      return rows.map((s) => this.slipDto(s, entries));
    });
  }
}
