/** Date helpers for the month calendar. All dates are "YYYY-MM-DD" text and all maths is done in UTC, so the time zone never shifts a day. */

export interface MonthCell { iso: string; day: number; inMonth: boolean; isToday: boolean }

export const toIso = (d: Date): string => d.toISOString().slice(0, 10);

/** Moves a (year, month 0-11) pair forwards or backwards by whole months. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/**
 * The weeks to draw for a month: whole weeks (Monday first by default) that include the leading days of the
 * previous month and the trailing days of the next, so every row has seven cells.
 */
export function buildMonthGrid(year: number, month: number, today: string, weekStart = 1): MonthCell[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() - weekStart + 7) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const total = Math.ceil((offset + daysInMonth) / 7) * 7;
  const weeks: MonthCell[][] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(Date.UTC(year, month, 1 - offset + i));
    const iso = toIso(d);
    const cell: MonthCell = { iso, day: d.getUTCDate(), inMonth: d.getUTCMonth() === month, isToday: iso === today };
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(cell);
  }
  return weeks;
}

/** The date range to ask the server for so every visible cell of the grid has its events. */
export function gridRange(weeks: MonthCell[][]): { from: string; to: string } {
  return { from: weeks[0][0].iso, to: weeks[weeks.length - 1][6].iso };
}

/** Events (inclusive start/end dates) that fall on the given day. */
export function eventsOnDay<T extends { startDate: string; endDate: string }>(events: T[], iso: string): T[] {
  return events.filter((e) => e.startDate <= iso && e.endDate >= iso);
}

/** Events that touch the given month at all (used for the list under the calendar). */
export function eventsInMonth<T extends { startDate: string; endDate: string }>(events: T[], year: number, month: number): T[] {
  const first = toIso(new Date(Date.UTC(year, month, 1)));
  const last = toIso(new Date(Date.UTC(year, month + 1, 0)));
  return events.filter((e) => e.startDate <= last && e.endDate >= first);
}
