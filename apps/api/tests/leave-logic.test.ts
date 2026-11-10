import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAVE_TYPES, balanceOf, eachDay, inclusiveDays, leaveDaysToWrite, leaveNo, leaveYear, rangesOverlap, withinQuota } from '../src/modules/leave/leave.logic';

describe('leave rules', () => {
  it('counts calendar days with both ends included', () => {
    expect(inclusiveDays('2026-11-02', '2026-11-02')).toBe(1);
    expect(inclusiveDays('2026-11-02', '2026-11-06')).toBe(5);
    expect(inclusiveDays('2026-02-27', '2026-03-02')).toBe(4);
    expect(inclusiveDays('2026-11-05', '2026-11-01')).toBeLessThanOrEqual(0);
  });

  it('lists every day of a range, across a year end too', () => {
    expect(eachDay('2026-12-30', '2027-01-01')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
    expect(eachDay('2026-11-05', '2026-11-01')).toEqual([]);
  });

  it('counts a request in the year it starts', () => {
    expect(leaveYear('2026-12-30')).toBe(2026);
  });

  it('finds overlapping ranges (a shared single day overlaps)', () => {
    expect(rangesOverlap('2026-11-01', '2026-11-05', '2026-11-05', '2026-11-09')).toBe(true);
    expect(rangesOverlap('2026-11-01', '2026-11-04', '2026-11-05', '2026-11-09')).toBe(false);
  });

  it('works out the balance and the quota check', () => {
    expect(balanceOf(10, 4, 2)).toEqual({ quota: 10, used: 4, pending: 2, remaining: 6 });
    expect(balanceOf(null, 4, 0).remaining).toBeNull();
    expect(balanceOf(3, 5, 0).remaining).toBe(0);
    expect(withinQuota(10, 8, 2)).toBe(true);
    expect(withinQuota(10, 8, 3)).toBe(false);
    expect(withinQuota(null, 999, 5)).toBe(true);
  });

  it('keeps days the person already worked (PRESENT or LATE) when writing LEAVE', () => {
    expect(leaveDaysToWrite(['a', 'b', 'c', 'd'], { a: 'PRESENT', b: 'ABSENT', c: 'LATE' })).toEqual(['b', 'd']);
  });

  it('numbers requests and offers sensible defaults', () => {
    expect(leaveNo(7)).toBe('L-000007');
    expect(DEFAULT_LEAVE_TYPES.some((t) => !t.paid && t.yearlyQuota === null)).toBe(true);
    expect(new Set(DEFAULT_LEAVE_TYPES.map((t) => t.name.toLowerCase())).size).toBe(DEFAULT_LEAVE_TYPES.length);
  });
});
