/** Pure visitor-log rules (no database). Times are ISO timestamps; "a day" means a UTC calendar day. */
export const VISIT_COUNTER = 'visit_no';
export const visitNo = (n: number): string => `V-${String(n).padStart(6, '0')}`;
/** Whole minutes between check-in and check-out; null while the visitor is still inside. Never negative. */
export function minutesInside(checkInAt: string, checkOutAt: string | null): number | null {
  if (checkOutAt === null) return null;
  return Math.max(0, Math.round((Date.parse(checkOutAt) - Date.parse(checkInAt)) / 60_000));
}
/** Start (included) and end (excluded) of a "YYYY-MM-DD" day as Date objects. */
export function dayRange(day: string): { start: Date; end: Date } {
  const start = new Date(`${day}T00:00:00Z`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}
