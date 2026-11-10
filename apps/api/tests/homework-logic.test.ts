import { describe, expect, it } from 'vitest';
import { childStatus, dateProblem, homeworkState, tally, validMarks } from '../src/modules/homework/homework.logic';

describe('homework state', () => {
  it('is upcoming, due today or overdue by the due date', () => {
    expect(homeworkState('2026-11-05', '2026-11-04')).toBe('UPCOMING');
    expect(homeworkState('2026-11-04', '2026-11-04')).toBe('DUE_TODAY');
    expect(homeworkState('2026-11-03', '2026-11-04')).toBe('OVERDUE');
  });
});

describe('date rules', () => {
  const today = '2026-11-04';
  it('accepts today or earlier as the assigned date and a due date on or after it', () => {
    expect(dateProblem('2026-11-04', '2026-11-04', today)).toBeNull();
    expect(dateProblem('2026-11-01', '2026-11-10', today)).toBeNull();
  });
  it('refuses a future assigned date, a due date before it and a due date more than a year away', () => {
    expect(dateProblem('2026-11-05', '2026-11-06', today)).toContain('future');
    expect(dateProblem('2026-11-04', '2026-11-03', today)).toContain('before');
    expect(dateProblem('2026-11-04', '2027-11-04', today)).toBeNull(); // exactly 365 days
    expect(dateProblem('2026-11-04', '2027-11-05', today)).toContain('year');
  });
});

describe('marks and counts', () => {
  it('marks are whole numbers from 0 to the maximum', () => {
    expect(validMarks(0, 10)).toBe(true);
    expect(validMarks(10, 10)).toBe(true);
    expect(validMarks(11, 10)).toBe(false);
    expect(validMarks(-1, 10)).toBe(false);
    expect(validMarks(2.5, 10)).toBe(false);
  });
  it('counts statuses and treats unchecked students as pending, never below zero', () => {
    expect(tally(30, ['SUBMITTED', 'SUBMITTED', 'LATE', 'MISSING'])).toEqual({ students: 30, submitted: 2, late: 1, missing: 1, pending: 26 });
    expect(tally(0, [])).toEqual({ students: 0, submitted: 0, late: 0, missing: 0, pending: 0 });
    expect(tally(1, ['SUBMITTED', 'LATE']).pending).toBe(0); // a checked student has since left the section
  });
  it('shows PENDING to parents until the teacher has checked', () => {
    expect(childStatus(null)).toBe('PENDING');
    expect(childStatus('LATE')).toBe('LATE');
  });
});
