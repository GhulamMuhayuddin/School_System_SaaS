import { describe, expect, it } from 'vitest';
import { accessionNo, addDays, copyChangeProblem, dueProblem, fineFor, loanState, normaliseAccession, overdueDays } from '../src/modules/library/library.logic';

describe('library logic', () => {
  it('adds days across month and year ends and leap days', () => {
    expect(addDays('2026-11-06', 14)).toBe('2026-11-20');
    expect(addDays('2026-12-25', 14)).toBe('2027-01-08');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('counts overdue days, never negative', () => {
    expect(overdueDays('2026-11-10', '2026-11-10')).toBe(0);
    expect(overdueDays('2026-11-10', '2026-11-05')).toBe(0);
    expect(overdueDays('2026-11-10', '2026-11-13')).toBe(3);
    expect(overdueDays('2026-12-30', '2027-01-02')).toBe(3);
  });
  it('computes fines in whole rupees', () => {
    expect(fineFor(3, 5)).toBe(15);
    expect(fineFor(0, 5)).toBe(0);
    expect(fineFor(4, 0)).toBe(0);
    expect(fineFor(-2, 5)).toBe(0);
  });
  it('tells the state of a loan', () => {
    expect(loanState('2026-11-10', null, '2026-11-10')).toBe('OPEN');
    expect(loanState('2026-11-10', null, '2026-11-11')).toBe('OVERDUE');
    expect(loanState('2026-11-10', '2026-11-30', '2026-12-01')).toBe('RETURNED');
  });
  it('formats and normalises accession numbers', () => {
    expect(accessionNo(1)).toBe('LIB-000001');
    expect(accessionNo(123456)).toBe('LIB-123456');
    expect(normaliseAccession('  lib-000007 ')).toBe('LIB-000007');
  });
  it('limits the due date on issue', () => {
    expect(dueProblem('2026-11-06', '2026-11-20')).toBeNull();
    expect(dueProblem('2026-11-06', '2026-11-06')).not.toBeNull();
    expect(dueProblem('2026-11-06', '2026-11-05')).not.toBeNull();
    expect(dueProblem('2026-11-06', '2027-02-04')).toBeNull();
    expect(dueProblem('2026-11-06', '2027-02-05')).not.toBeNull();
  });
  it('allows only sensible manual copy status changes', () => {
    expect(copyChangeProblem('AVAILABLE', 'LOST')).toBeNull();
    expect(copyChangeProblem('LOST', 'AVAILABLE')).toBeNull();
    expect(copyChangeProblem('WITHDRAWN', 'AVAILABLE')).toBeNull();
    expect(copyChangeProblem('ISSUED', 'LOST')).not.toBeNull();
    expect(copyChangeProblem('AVAILABLE', 'AVAILABLE')).not.toBeNull();
    expect(copyChangeProblem('AVAILABLE', 'ISSUED')).not.toBeNull();
  });
});
