/** Pure leave rules (no database). Dates are plain "YYYY-MM-DD" text. */
export const MAX_LEAVE_DAYS = 90;
export type LeaveStatusValue = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

const DAY_MS = 86_400_000;
const at = (d: string): number => Date.parse(`${d}T00:00:00Z`);

/** Calendar days from `from` to `to`, both included (same day = 1). Zero or negative when `to` is before `from`. */
export const inclusiveDays = (from: string, to: string): number => Math.round((at(to) - at(from)) / DAY_MS) + 1;

/** Every day from `from` to `to` as text, both included. Empty when `to` is before `from`. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = at(from); t <= at(to); t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** The leave year a request counts in: the year it starts. */
export const leaveYear = (from: string): number => Number(from.slice(0, 4));

/** Do two inclusive day ranges share at least one day? */
export const rangesOverlap = (aFrom: string, aTo: string, bFrom: string, bTo: string): boolean => aFrom <= bTo && bFrom <= aTo;

export interface Balance { quota: number | null; used: number; pending: number; remaining: number | null }
/** `quota` null = no limit. `used` = approved days, `pending` = days waiting for a decision. */
export function balanceOf(quota: number | null, used: number, pending: number): Balance {
  return { quota, used, pending, remaining: quota === null ? null : Math.max(0, quota - used) };
}

/** Would approving `days` more keep the staff member within the yearly quota? (Pending days of other requests do not count until they are approved.) */
export const withinQuota = (quota: number | null, approvedDays: number, days: number): boolean => quota === null || approvedDays + days <= quota;

/** A staff member's days that an approved leave should turn into LEAVE: every day except those already marked PRESENT or LATE (they came to work). */
export function leaveDaysToWrite(range: string[], existing: Record<string, string>): string[] {
  return range.filter((d) => existing[d] !== 'PRESENT' && existing[d] !== 'LATE');
}

export const LEAVE_COUNTER = 'leave_no';
export const leaveNo = (n: number): string => `L-${String(n).padStart(6, '0')}`;

/** Leave types offered by "Add common types". Casual and sick are paid with a yearly limit; unpaid has no limit and is deducted in payroll. */
export const DEFAULT_LEAVE_TYPES: readonly { name: string; yearlyQuota: number | null; paid: boolean }[] = [
  { name: 'Casual leave', yearlyQuota: 10, paid: true },
  { name: 'Sick leave', yearlyQuota: 8, paid: true },
  { name: 'Annual leave', yearlyQuota: 14, paid: true },
  { name: 'Unpaid leave', yearlyQuota: null, paid: false },
];
