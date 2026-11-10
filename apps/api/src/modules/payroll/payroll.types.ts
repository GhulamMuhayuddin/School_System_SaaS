import type { RunTotals } from './payroll.logic';

export type { RunTotals };
export type PayMethod = 'CASH' | 'BANK' | 'ONLINE';
export type RunStatus = 'DRAFT' | 'FINALIZED';
export interface StaffRef { id: string; employeeNo: string; name: string; designation: string }
export interface SalaryDto { basic: number; allowances: number; fixedDeduction: number; gross: number; notes: string | null }
export interface SalaryRow { staff: StaffRef & { category: string }; salary: SalaryDto | null }
export interface SalaryInput { basic: number; allowances?: number; fixedDeduction?: number; notes?: string | null }
export interface SalaryFilter { q?: string; missing?: boolean }
export interface PayslipDto {
  id: string; slipNo: string; runId: string; period: string; staff: StaffRef;
  basic: number; allowances: number; fixedDeduction: number; absentDays: number; unpaidLeaveDays: number; outsideDays: number; deductionDays: number;
  attendanceDeduction: number; bonus: number; otherDeduction: number; note: string | null; gross: number; net: number;
  /** True only while the salary entry in Accounts is not voided. */
  paid: boolean; paidOn: string | null; method: PayMethod | null; accountEntryNo: string | null; paymentVoided: boolean;
}
export interface RunSummaryDto { id: string; period: string; status: RunStatus; createdAt: string; finalizedAt: string | null; totals: RunTotals }
export interface RunDetailDto extends RunSummaryDto { payslips: PayslipDto[]; skipped: { id: string; employeeNo: string; name: string }[] }
export interface SlipPatch { bonus?: number; otherDeduction?: number; note?: string | null }
export interface SchoolHeader { name: string; address: string | null; city: string | null; phone: string | null; email: string | null }
export interface PayslipDetail { payslip: PayslipDto; school: SchoolHeader }
export interface PayInput { method: PayMethod; paidOn?: string }

/** Every method receives the schoolId from the verified token (never from the request); `actorId` is the signed-in user. */
export interface PayrollApi {
  listSalaries(schoolId: string, filter: SalaryFilter): Promise<{ rows: SalaryRow[]; truncated: boolean }>;
  setSalary(schoolId: string, actorId: string, staffId: string, input: SalaryInput): Promise<SalaryRow>;
  listRuns(schoolId: string): Promise<RunSummaryDto[]>;
  getRun(schoolId: string, id: string): Promise<RunDetailDto>;
  createRun(schoolId: string, actorId: string, period: string): Promise<RunDetailDto>;
  regenerate(schoolId: string, actorId: string, id: string): Promise<RunDetailDto>;
  deleteRun(schoolId: string, actorId: string, id: string): Promise<void>;
  finalize(schoolId: string, actorId: string, id: string): Promise<RunDetailDto>;
  reopen(schoolId: string, actorId: string, id: string): Promise<RunDetailDto>;
  updateSlip(schoolId: string, actorId: string, slipId: string, patch: SlipPatch): Promise<PayslipDto>;
  pay(schoolId: string, actorId: string, slipId: string, input: PayInput): Promise<PayslipDto>;
  voidPayment(schoolId: string, actorId: string, slipId: string, reason: string): Promise<PayslipDto>;
  /** Finalized payslips of the staff member linked to this login (any school user, own record only). */
  mySlips(schoolId: string, userId: string): Promise<PayslipDto[]>;
  /** One payslip with the school header, for printing (HR / accountant). */
  getSlip(schoolId: string, id: string): Promise<PayslipDetail>;
  /** One of the caller's own finalized payslips with the school header, for printing. Anything else is a 404. */
  mySlip(schoolId: string, userId: string, id: string): Promise<PayslipDetail>;
}
