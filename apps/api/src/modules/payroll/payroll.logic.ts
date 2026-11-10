/** Pure payroll rules (no database). Money is whole rupees. Dates are "YYYY-MM-DD", periods are "YYYY-MM". */

/** A month always counts as 30 days for the daily rate (gross / 30), whatever its real length. */
export const MONTH_DIVISOR = 30;
export const MAX_AMOUNT = 10_000_000;
const DAY_MS = 86_400_000;

export const isPeriod = (v: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export interface MonthRange { first: string; last: string; days: number }
/** First day, last day and length of a "YYYY-MM" month. */
export function monthRange(period: string): MonthRange {
  const [y, m] = period.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { first: `${y}-${mm}-01`, last: `${y}-${mm}-${String(days).padStart(2, '0')}`, days };
}

/** Days of the month on which the person was not employed: before the joining date, or after the leaving date (left day itself is paid). */
export function outsideDays(period: string, joiningDate: string, leftAt: string | null): number {
  const { first, last, days } = monthRange(period);
  const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const from = joiningDate > first ? joiningDate : first;
  const to = leftAt !== null && leftAt < last ? leftAt : last;
  const worked = to < from ? 0 : Math.round((t(to) - t(from)) / DAY_MS) + 1;
  return days - worked;
}

/** Was the person employed on at least one day of the month? (Joined later or left earlier = no payslip.) */
export const employedInMonth = (period: string, joiningDate: string, leftAt: string | null): boolean => {
  const { days } = monthRange(period);
  return outsideDays(period, joiningDate, leftAt) < days;
};

export interface AttendanceRow { date: string; status: 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE'; leavePaid: boolean | null }
export interface DayCounts { absentDays: number; unpaidLeaveDays: number }
/**
 * Unpaid days from the staff attendance rows of the month.
 * ABSENT = unpaid. LEAVE = unpaid only when it came from an approved request of an UNPAID leave type (`leavePaid === false`);
 * a LEAVE day marked by hand (no request, `leavePaid === null`) and any paid-type leave stay paid.
 * Days outside the employment window are ignored (they are counted as outsideDays). Days nobody marked are NOT deducted.
 */
export function countUnpaid(rows: AttendanceRow[], period: string, joiningDate: string, leftAt: string | null): DayCounts {
  const { first, last } = monthRange(period);
  const from = joiningDate > first ? joiningDate : first;
  const to = leftAt !== null && leftAt < last ? leftAt : last;
  let absentDays = 0;
  let unpaidLeaveDays = 0;
  for (const r of rows) {
    if (r.date < from || r.date > to) continue;
    if (r.status === 'ABSENT') absentDays += 1;
    else if (r.status === 'LEAVE' && r.leavePaid === false) unpaidLeaveDays += 1;
  }
  return { absentDays, unpaidLeaveDays };
}

export interface SlipInput {
  basic: number; allowances: number; fixedDeduction: number; bonus: number; otherDeduction: number;
  absentDays: number; unpaidLeaveDays: number; outsideDays: number;
}
export interface SlipFigures { gross: number; deductionDays: number; attendanceDeduction: number; rawNet: number; net: number }
/**
 * gross = basic + allowances. Unpaid days = absent + unpaid leave + days outside employment, at most 30.
 * attendance deduction = round(gross x unpaid days / 30). net = gross + bonus - fixed - attendance - other, never below 0 (`rawNet` shows the real value).
 */
export function computeSlip(i: SlipInput): SlipFigures {
  const gross = i.basic + i.allowances;
  const deductionDays = Math.min(MONTH_DIVISOR, Math.max(0, i.absentDays + i.unpaidLeaveDays + i.outsideDays));
  const attendanceDeduction = Math.round((gross * deductionDays) / MONTH_DIVISOR);
  const rawNet = gross + i.bonus - i.fixedDeduction - attendanceDeduction - i.otherDeduction;
  return { gross, deductionDays, attendanceDeduction, rawNet, net: Math.max(0, rawNet) };
}

export const slipNo = (n: number): string => `P-${String(n).padStart(6, '0')}`;
export const SLIP_COUNTER = 'payslip_no';
export const SALARY_CATEGORY = 'Salaries';

export interface RunTotals { slips: number; gross: number; net: number; paidSlips: number; paidAmount: number; unpaidAmount: number }
export function runTotals(slips: { gross: number; net: number; paid: boolean }[]): RunTotals {
  const paid = slips.filter((s) => s.paid);
  const paidAmount = paid.reduce((n, s) => n + s.net, 0);
  const net = slips.reduce((n, s) => n + s.net, 0);
  return { slips: slips.length, gross: slips.reduce((n, s) => n + s.gross, 0), net, paidSlips: paid.length, paidAmount, unpaidAmount: net - paidAmount };
}
