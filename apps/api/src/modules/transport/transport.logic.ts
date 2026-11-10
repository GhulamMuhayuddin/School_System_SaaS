/** Pure transport rules (no database). */
export const MAX_STOPS = 40;
export const MAX_VEHICLE_CAPACITY = 200;

/** "07:05" style 24 hour time. */
export const validTime = (t: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/** Stops should be picked up in the order they are listed: times that go backwards are a typing mistake. Returns the 1-based position of the first bad stop, or null. */
export function firstOutOfOrder(times: (string | null)[]): number | null {
  let last = '';
  for (const [i, t] of times.entries()) {
    if (!t) continue;
    if (last && t < last) return i + 1;
    last = t;
  }
  return null;
}

export type SeatState = 'NO_VEHICLE' | 'FREE' | 'FULL' | 'OVER';
/** Seat situation of a route: a route without a vehicle has no limit to check. */
export function seatState(capacity: number | null, riders: number): SeatState {
  if (capacity === null) return 'NO_VEHICLE';
  return riders > capacity ? 'OVER' : riders === capacity ? 'FULL' : 'FREE';
}

/** Can one more student board? `alreadyOnRoute` is true when the student is only changing stops on the same route. */
export function canBoard(capacity: number | null, riders: number, alreadyOnRoute: boolean): boolean {
  if (alreadyOnRoute || capacity === null) return true;
  return riders < capacity;
}

/** Expected monthly income of a route (everyone on it pays the route fee). */
export const routeIncome = (monthlyFee: number, riders: number): number => Math.max(0, monthlyFee) * Math.max(0, riders);
