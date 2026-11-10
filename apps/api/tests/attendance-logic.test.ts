import { describe, expect, it } from 'vitest';
import { monthBounds, todayIn, totalsOf } from '../src/modules/attendance/attendance.logic';

describe('attendance logic', () => {
  it('follows the school time zone for "today" (22:30 UTC is already tomorrow in Karachi)', () => {
    const late = new Date(Date.UTC(2026, 5, 14, 22, 30));
    expect(todayIn('Asia/Karachi', late)).toBe('2026-06-15');
    expect(todayIn('UTC', late)).toBe('2026-06-14');
  });

  it('knows the length of every month, including leap years', () => {
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28', days: 28 });
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29', days: 29 });
    expect(monthBounds('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31', days: 31 });
  });

  it('counts late as attended, counts every marked day, and gives no percentage when nothing is marked', () => {
    expect(totalsOf([])).toEqual({ present: 0, absent: 0, late: 0, leave: 0, marked: 0, percentage: null });
    expect(totalsOf(['PRESENT', 'PRESENT', 'LATE', 'ABSENT'])).toEqual({ present: 2, absent: 1, late: 1, leave: 0, marked: 4, percentage: 75 });
    expect(totalsOf(['PRESENT', 'ABSENT', 'ABSENT']).percentage).toBe(33);
    expect(totalsOf(['LEAVE', 'PRESENT']).percentage).toBe(50);
  });
});
