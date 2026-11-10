/** Pure library rules (no database). Dates are YYYY-MM-DD text. */
export type LoanState = 'OPEN' | 'OVERDUE' | 'RETURNED';
export type CopyStatusKey = 'AVAILABLE' | 'ISSUED' | 'LOST' | 'WITHDRAWN';
export type FineStatusKey = 'NONE' | 'UNPAID' | 'PAID' | 'WAIVED';

export const MAX_LOAN_DAYS = 90;
export const MAX_RENEWALS = 2;
export const DEFAULT_SETTINGS = { loanDays: 14, finePerDay: 5, maxBooksStudent: 3 } as const;

const dayNumber = (d: string): number => Math.floor(new Date(`${d}T00:00:00Z`).getTime() / 86_400_000);

/** The day `days` after `day` (negative allowed). */
export function addDays(day: string, days: number): string {
  return new Date((dayNumber(day) + days) * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days a book is late: 0 on or before the due date. */
export const overdueDays = (dueOn: string, on: string): number => Math.max(0, dayNumber(on) - dayNumber(dueOn));

/** Fine in whole rupees for the days late. */
export const fineFor = (days: number, perDay: number): number => Math.max(0, days) * Math.max(0, perDay);

export function loanState(dueOn: string, returnedOn: string | null, today: string): LoanState {
  if (returnedOn) return 'RETURNED';
  return dueOn < today ? 'OVERDUE' : 'OPEN';
}

/** Accession numbers LIB-000001, LIB-000002 ... (the counter never reuses a number). */
export const accessionNo = (n: number): string => `LIB-${String(n).padStart(6, '0')}`;

/** Normalises what a librarian types or scans (case and spaces do not matter). */
export const normaliseAccession = (v: string): string => v.trim().toUpperCase();

/** Error text for a bad due date on issue, or null when fine. */
export function dueProblem(today: string, dueOn: string): string | null {
  if (dueOn <= today) return 'The due date must be after today';
  if (dayNumber(dueOn) - dayNumber(today) > MAX_LOAN_DAYS) return `The due date must be within ${MAX_LOAN_DAYS} days`;
  return null;
}

/** Copy status changes the librarian may make by hand. An issued copy is only changed by returning it. */
export function copyChangeProblem(from: CopyStatusKey, to: CopyStatusKey): string | null {
  if (from === 'ISSUED') return 'This copy is issued; return it first';
  if (from === to) return 'The copy already has this status';
  if (to === 'ISSUED') return 'Issue the copy from the issue desk';
  return null;
}
