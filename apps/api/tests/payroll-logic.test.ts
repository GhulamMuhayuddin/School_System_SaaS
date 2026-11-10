import { describe, expect, it } from 'vitest';
import { computeSlip, countUnpaid, employedInMonth, isPeriod, monthRange, outsideDays, runTotals, slipNo, type AttendanceRow } from '../src/modules/payroll/payroll.logic';

describe('payroll rules', () => {
  it('knows the length of every month', () => {
    expect(monthRange('2026-02')).toEqual({ first: '2026-02-01', last: '2026-02-28', days: 28 });
    expect(monthRange('2028-02').days).toBe(29);
    expect(monthRange('2026-10').days).toBe(31);
    expect(isPeriod('2026-13')).toBe(false);
    expect(isPeriod('2026-11')).toBe(true);
  });

  it('counts the days before joining and after leaving (the leaving day itself is paid)', () => {
    expect(outsideDays('2026-11', '2025-01-01', null)).toBe(0);
    expect(outsideDays('2026-11', '2026-11-11', null)).toBe(10);
    expect(outsideDays('2026-11', '2025-01-01', '2026-11-20')).toBe(10);
    expect(outsideDays('2026-11', '2026-12-01', null)).toBe(30);
    expect(employedInMonth('2026-11', '2026-12-01', null)).toBe(false);
    expect(employedInMonth('2026-11', '2025-01-01', '2026-10-31')).toBe(false);
    expect(employedInMonth('2026-11', '2025-01-01', '2026-11-01')).toBe(true);
  });

  const rows: AttendanceRow[] = [
    { date: '2026-11-03', status: 'ABSENT', leavePaid: null },
    { date: '2026-11-04', status: 'ABSENT', leavePaid: null },
    { date: '2026-11-05', status: 'LEAVE', leavePaid: false },
    { date: '2026-11-06', status: 'LEAVE', leavePaid: true },
    { date: '2026-11-09', status: 'LEAVE', leavePaid: null },
    { date: '2026-11-10', status: 'LATE', leavePaid: null },
    { date: '2026-10-31', status: 'ABSENT', leavePaid: null },
    { date: '2026-11-25', status: 'ABSENT', leavePaid: null },
  ];
  it('deducts absent days and unpaid-type leave only; paid and hand-marked leave stay paid', () => {
    expect(countUnpaid(rows, '2026-11', '2025-01-01', null)).toEqual({ absentDays: 3, unpaidLeaveDays: 1 });
  });
  it('ignores marks outside the employment window', () => {
    expect(countUnpaid(rows, '2026-11', '2025-01-01', '2026-11-20')).toEqual({ absentDays: 2, unpaidLeaveDays: 1 });
  });

  it('works out a payslip: gross 30,000, 4 unpaid days = 4,000, net 26,000', () => {
    expect(computeSlip({ basic: 25000, allowances: 5000, fixedDeduction: 1500, bonus: 2000, otherDeduction: 500, absentDays: 3, unpaidLeaveDays: 1, outsideDays: 0 }))
      .toEqual({ gross: 30000, deductionDays: 4, attendanceDeduction: 4000, rawNet: 26000, net: 26000 });
  });
  it('rounds the deduction to whole rupees', () => {
    expect(computeSlip({ basic: 10000, allowances: 0, fixedDeduction: 0, bonus: 0, otherDeduction: 0, absentDays: 1, unpaidLeaveDays: 0, outsideDays: 0 }).attendanceDeduction).toBe(333);
  });
  it('never deducts more than 30 days and never pays below 0', () => {
    const s = computeSlip({ basic: 20000, allowances: 0, fixedDeduction: 0, bonus: 0, otherDeduction: 0, absentDays: 5, unpaidLeaveDays: 0, outsideDays: 31 });
    expect(s.deductionDays).toBe(30); expect(s.attendanceDeduction).toBe(20000); expect(s.net).toBe(0);
    const t = computeSlip({ basic: 10000, allowances: 0, fixedDeduction: 9000, bonus: 0, otherDeduction: 3000, absentDays: 0, unpaidLeaveDays: 0, outsideDays: 0 });
    expect(t.rawNet).toBe(-2000); expect(t.net).toBe(0);
  });

  it('numbers payslips and totals a run', () => {
    expect(slipNo(7)).toBe('P-000007');
    expect(runTotals([{ gross: 100, net: 90, paid: true }, { gross: 200, net: 150, paid: false }])).toEqual({ slips: 2, gross: 300, net: 240, paidSlips: 1, paidAmount: 90, unpaidAmount: 150 });
    expect(runTotals([])).toEqual({ slips: 0, gross: 0, net: 0, paidSlips: 0, paidAmount: 0, unpaidAmount: 0 });
  });
});
