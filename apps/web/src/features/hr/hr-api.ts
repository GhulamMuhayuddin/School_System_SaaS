import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

// ---- leave ---------------------------------------------------------------------------------------------------------
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export const LEAVE_STATUSES: LeaveStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
export interface LeaveType { id: string; name: string; yearlyQuota: number | null; paid: boolean; active: boolean }
export interface LeaveRequest {
  id: string; requestNo: string; staff: { id: string; employeeNo: string; name: string }; leaveType: { id: string; name: string; paid: boolean };
  fromDate: string; toDate: string; days: number; reason: string | null; status: LeaveStatus; decidedAt: string | null; decisionNote: string | null; createdAt: string;
}
export interface Balance { quota: number | null; used: number; pending: number; remaining: number | null }
export interface Balances { staff: { id: string; employeeNo: string; name: string }; year: number; balances: { leaveType: { id: string; name: string; paid: boolean }; balance: Balance }[] }
export interface ApplyValues { leaveTypeId: string; fromDate: string; toDate: string; reason: string | null; staffId?: string }
export interface TypeValues { name: string; yearlyQuota: number | null; paid: boolean }

export const leaveTone = (s: LeaveStatus): 'warning' | 'success' | 'danger' | 'neutral' => (s === 'PENDING' ? 'warning' : s === 'APPROVED' ? 'success' : s === 'REJECTED' ? 'danger' : 'neutral');

/** Calendar days from `from` to `to`, both included; 0 when either is empty or `to` is before `from` (same rule as the server). */
export function daysBetween(from: string, to: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return 0;
  const d = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  return d >= 1 ? d : 0;
}
/** Yearly quota text: blank means "no limit" (null); a whole number 1-366 is returned; anything else is undefined. */
export function parseQuota(text: string): number | null | undefined {
  const v = text.trim();
  if (v === '') return null;
  return /^\d{1,3}$/.test(v) && Number(v) >= 1 && Number(v) <= 366 ? Number(v) : undefined;
}

const qs = (o: Record<string, string | boolean | number | undefined>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const useLeaveTypes = (includeInactive = false) => useQuery({ queryKey: ['leave', 'types', includeInactive], queryFn: () => apiFetch<LeaveType[]>(`/leave/types${qs({ includeInactive })}`) });
export const useLeaveRequests = (f: { status?: LeaveStatus; mine?: boolean }) =>
  useQuery({ queryKey: ['leave', 'requests', f], queryFn: () => apiFetch<{ requests: LeaveRequest[]; truncated: boolean }>(`/leave/requests${qs({ ...f })}`) });
export const useBalances = (year: number) => useQuery({ queryKey: ['leave', 'balances', year], queryFn: () => apiFetch<Balances>(`/leave/balances${qs({ year })}`), retry: false });

/** A decision also changes staff attendance (LEAVE days), so attendance screens are refreshed too. */
function useLeaveMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['leave'] }), qc.invalidateQueries({ queryKey: ['attendance'] })]) });
}
export const useApplyLeave = () => useLeaveMutation((v: ApplyValues) => apiFetch<LeaveRequest>('/leave/requests', { method: 'POST', body: v }));
export const useDecideLeave = () => useLeaveMutation((v: { id: string; action: 'approve' | 'reject'; note: string | null }) => apiFetch<LeaveRequest>(`/leave/requests/${v.id}/${v.action}`, { method: 'POST', body: { note: v.note } }));
export const useCancelLeave = () => useLeaveMutation((id: string) => apiFetch<LeaveRequest>(`/leave/requests/${id}/cancel`, { method: 'POST' }));
export const useCreateLeaveType = () => useLeaveMutation((v: TypeValues) => apiFetch<LeaveType>('/leave/types', { method: 'POST', body: v }));
export const useUpdateLeaveType = () => useLeaveMutation((v: { id: string; patch: Partial<TypeValues> & { active?: boolean } }) => apiFetch<LeaveType>(`/leave/types/${v.id}`, { method: 'PATCH', body: v.patch }));
export const useDefaultLeaveTypes = () => useLeaveMutation(() => apiFetch<{ created: number; types: LeaveType[] }>('/leave/types/defaults', { method: 'POST' }));

// ---- payroll -------------------------------------------------------------------------------------------------------
export type PayMethod = 'CASH' | 'BANK' | 'ONLINE';
export const PAY_METHODS: PayMethod[] = ['CASH', 'BANK', 'ONLINE'];
export type RunStatus = 'DRAFT' | 'FINALIZED';
export interface StaffRef { id: string; employeeNo: string; name: string; designation: string }
export interface Salary { basic: number; allowances: number; fixedDeduction: number; gross: number; notes: string | null }
export interface SalaryRow { staff: StaffRef & { category: string }; salary: Salary | null }
export interface RunTotals { slips: number; gross: number; net: number; paidSlips: number; paidAmount: number; unpaidAmount: number }
export interface RunSummary { id: string; period: string; status: RunStatus; createdAt: string; finalizedAt: string | null; totals: RunTotals }
export interface Payslip {
  id: string; slipNo: string; runId: string; period: string; staff: StaffRef; basic: number; allowances: number; fixedDeduction: number;
  absentDays: number; unpaidLeaveDays: number; outsideDays: number; deductionDays: number; attendanceDeduction: number; bonus: number; otherDeduction: number;
  note: string | null; gross: number; net: number; paid: boolean; paidOn: string | null; method: PayMethod | null; accountEntryNo: string | null; paymentVoided: boolean;
}
export interface RunDetail extends RunSummary { payslips: Payslip[]; skipped: { id: string; employeeNo: string; name: string }[] }
export interface PayslipDetail { payslip: Payslip; school: { name: string; address: string | null; city: string | null; phone: string | null; email: string | null } }
export interface SalaryValues { basic: number; allowances: number; fixedDeduction: number; notes: string | null }

/** Whole rupees: blank = 0, digits with optional commas up to 10,000,000; anything else is null. */
export function parseAmount(text: string): number | null {
  const v = text.trim().replace(/,/g, '');
  if (v === '') return 0;
  return /^\d{1,8}$/.test(v) && Number(v) <= 10_000_000 ? Number(v) : null;
}
/** "2026-10" -> "October 2026" (or the Urdu month name). */
export const periodLabel = (period: string, lang: string): string => {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};
export const currentPeriod = (now: Date = new Date()): string => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
export const todayText = (now: Date = new Date()): string => `${currentPeriod(now)}-${String(now.getDate()).padStart(2, '0')}`;
/** What the payslip net would be with these two amounts (same formula as the server); negative means the server would refuse it. */
export const slipNetWith = (s: Pick<Payslip, 'gross' | 'fixedDeduction' | 'attendanceDeduction'>, bonus: number, other: number): number => s.gross + bonus - s.fixedDeduction - s.attendanceDeduction - other;

export const useSalaries = (f: { q?: string; missing?: boolean }) => useQuery({ queryKey: ['payroll', 'salaries', f], queryFn: () => apiFetch<{ rows: SalaryRow[]; truncated: boolean }>(`/payroll/salaries${qs({ ...f })}`) });
export const useRuns = () => useQuery({ queryKey: ['payroll', 'runs'], queryFn: async () => (await apiFetch<{ runs: RunSummary[] }>('/payroll/runs')).runs });
export const useRun = (id: string) => useQuery({ queryKey: ['payroll', 'run', id], queryFn: () => apiFetch<RunDetail>(`/payroll/runs/${id}`) });
/** One payslip with the school header, for printing. `own` uses the endpoint that only returns the caller's own finalized payslip. */
export const usePayslipDetail = (id: string, own: boolean) =>
  useQuery({ queryKey: ['payroll', 'slip', id, own], queryFn: () => apiFetch<PayslipDetail>(own ? `/payroll/my/${id}` : `/payroll/payslips/${id}`) });
export const useMyPayslips = () => useQuery({ queryKey: ['payroll', 'my'], queryFn: async () => (await apiFetch<{ payslips: Payslip[] }>('/payroll/my')).payslips });

/** Paying writes an expense into Accounts, so those screens are refreshed together with payroll. */
function usePayrollMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['payroll'] }), qc.invalidateQueries({ queryKey: ['accounts'] })]) });
}
export const useSetSalary = () => usePayrollMutation((v: { staffId: string; values: SalaryValues }) => apiFetch<SalaryRow>(`/payroll/salaries/${v.staffId}`, { method: 'PUT', body: v.values }));
export const useCreateRun = () => usePayrollMutation((period: string) => apiFetch<RunDetail>('/payroll/runs', { method: 'POST', body: { period } }));
export const useRunAction = () => usePayrollMutation((v: { id: string; action: 'regenerate' | 'finalize' | 'reopen' }) => apiFetch<RunDetail>(`/payroll/runs/${v.id}/${v.action}`, { method: 'POST' }));
export const useDeleteRun = () => usePayrollMutation((id: string) => apiFetch<void>(`/payroll/runs/${id}`, { method: 'DELETE' }));
export const useUpdateSlip = () => usePayrollMutation((v: { id: string; patch: { bonus: number; otherDeduction: number; note: string | null } }) => apiFetch<Payslip>(`/payroll/payslips/${v.id}`, { method: 'PATCH', body: v.patch }));
export const usePaySlip = () => usePayrollMutation((v: { id: string; method: PayMethod; paidOn: string }) => apiFetch<Payslip>(`/payroll/payslips/${v.id}/pay`, { method: 'POST', body: { method: v.method, paidOn: v.paidOn } }));
export const useVoidPayment = () => usePayrollMutation((v: { id: string; reason: string }) => apiFetch<Payslip>(`/payroll/payslips/${v.id}/void-payment`, { method: 'POST', body: { reason: v.reason } }));
