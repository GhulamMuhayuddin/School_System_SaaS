import type { AttendanceStatus, Totals } from './attendance.types';

/** attended = PRESENT + LATE; percentage = attended / marked days (every status counts as a marked day), rounded; null when nothing is marked. */
export function totalsOf(statuses: AttendanceStatus[]): Totals {
  const count = (s: AttendanceStatus) => statuses.filter((x) => x === s).length;
  const present = count('PRESENT');
  const late = count('LATE');
  const marked = statuses.length;
  return { present, absent: count('ABSENT'), late, leave: count('LEAVE'), marked, percentage: marked === 0 ? null : Math.round(((present + late) / marked) * 100) };
}

/** First and last day of a "YYYY-MM" month, and how many days it has. */
export function monthBounds(month: string): { from: string; to: string; days: number } {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10), days: last.getUTCDate() };
}

/** The calendar date ("YYYY-MM-DD") it currently is in a time zone such as Asia/Karachi. */
export function todayIn(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); // en-CA prints YYYY-MM-DD
}
