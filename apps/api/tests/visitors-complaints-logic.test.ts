import { describe, expect, it } from 'vitest';
import { ageDays, canMove, complaintNo, isActive, nextStatuses, resolutionOk } from '../src/modules/complaints/complaints.logic';
import { dayRange, minutesInside, visitNo } from '../src/modules/visitors/visitors.logic';

describe('visitor rules', () => {
  it('numbers visits and measures the time inside', () => {
    expect(visitNo(7)).toBe('V-000007');
    expect(minutesInside('2026-11-04T09:00:00Z', null)).toBeNull();
    expect(minutesInside('2026-11-04T09:00:00Z', '2026-11-04T09:45:00Z')).toBe(45);
    expect(minutesInside('2026-11-04T09:00:00Z', '2026-11-04T09:00:20Z')).toBe(0);
    expect(minutesInside('2026-11-04T09:00:00Z', '2026-11-04T08:00:00Z')).toBe(0); // never negative
  });
  it('a day runs from midnight to the next midnight', () => {
    const { start, end } = dayRange('2026-11-04');
    expect(start.toISOString()).toBe('2026-11-04T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-05T00:00:00.000Z');
  });
});

describe('complaint rules', () => {
  it('numbers complaints', () => { expect(complaintNo(12)).toBe('C-000012'); });
  it('allows only sensible status changes', () => {
    expect(canMove('OPEN', 'IN_PROGRESS')).toBe(true);
    expect(canMove('OPEN', 'RESOLVED')).toBe(true);
    expect(canMove('OPEN', 'CLOSED')).toBe(false);
    expect(canMove('IN_PROGRESS', 'CLOSED')).toBe(false);
    expect(canMove('RESOLVED', 'CLOSED')).toBe(true);
    expect(canMove('RESOLVED', 'OPEN')).toBe(true);
    expect(canMove('CLOSED', 'OPEN')).toBe(true);
    expect(canMove('CLOSED', 'RESOLVED')).toBe(false);
    expect(canMove('OPEN', 'OPEN')).toBe(false);
    expect(nextStatuses('CLOSED')).toEqual(['OPEN']);
  });
  it('resolving needs a written resolution', () => {
    expect(resolutionOk('Fee corrected')).toBe(true);
    expect(resolutionOk('  ok ')).toBe(false);
    expect(resolutionOk('')).toBe(false);
    expect(resolutionOk(null)).toBe(false);
  });
  it('counts waiting days and active statuses', () => {
    expect(ageDays('2026-11-01T09:00:00Z', '2026-11-04T08:00:00Z')).toBe(2);
    expect(ageDays('2026-11-04T09:00:00Z', '2026-11-01T09:00:00Z')).toBe(0);
    expect(isActive('OPEN')).toBe(true); expect(isActive('IN_PROGRESS')).toBe(true);
    expect(isActive('RESOLVED')).toBe(false); expect(isActive('CLOSED')).toBe(false);
  });
});
