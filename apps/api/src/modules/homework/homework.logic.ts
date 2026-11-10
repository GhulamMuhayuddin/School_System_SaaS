/** Pure homework rules (no database). Dates are YYYY-MM-DD text. */
export type SubmissionStatusKey = 'SUBMITTED' | 'LATE' | 'MISSING';
export type HomeworkState = 'UPCOMING' | 'DUE_TODAY' | 'OVERDUE';

const MAX_DAYS_TO_DUE = 365;
const dayNumber = (d: string): number => Math.floor(new Date(`${d}T00:00:00Z`).getTime() / 86_400_000);

/** UPCOMING (due after today), DUE_TODAY, or OVERDUE (due date has passed). */
export function homeworkState(dueDate: string, today: string): HomeworkState {
  return dueDate > today ? 'UPCOMING' : dueDate === today ? 'DUE_TODAY' : 'OVERDUE';
}

/** Error text for a bad date combination, or null when fine. The assigned date cannot be in the future; the due date is on or after it and within a year. */
export function dateProblem(assignedDate: string, dueDate: string, today: string): string | null {
  if (assignedDate > today) return 'The assigned date cannot be in the future';
  if (dueDate < assignedDate) return 'The due date cannot be before the assigned date';
  if (dayNumber(dueDate) - dayNumber(assignedDate) > MAX_DAYS_TO_DUE) return 'The due date must be within a year of the assigned date';
  return null;
}

/** Marks are whole numbers from 0 to the homework's maximum. */
export const validMarks = (marks: number, maxMarks: number): boolean => Number.isInteger(marks) && marks >= 0 && marks <= maxMarks;

export interface Tally { students: number; submitted: number; late: number; missing: number; pending: number }
/** Counts for one homework: `pending` = students not checked yet (never negative, even if a student left after being checked). */
export function tally(students: number, statuses: SubmissionStatusKey[]): Tally {
  const submitted = statuses.filter((s) => s === 'SUBMITTED').length;
  const late = statuses.filter((s) => s === 'LATE').length;
  const missing = statuses.filter((s) => s === 'MISSING').length;
  return { students, submitted, late, missing, pending: Math.max(0, students - submitted - late - missing) };
}

/** What a parent sees for their child: the recorded status, or PENDING while the teacher has not checked yet. */
export const childStatus = (status: SubmissionStatusKey | null): SubmissionStatusKey | 'PENDING' => status ?? 'PENDING';
