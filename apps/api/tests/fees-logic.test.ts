import { describe, expect, it } from 'vitest';
import { balanceOf, discountFor, formatNo, isOverdue, netAmount, outstanding, outstandingFromSums, statusFor, validPeriod } from '../src/modules/fees/fees.logic';

describe('discounts', () => {
  it('percent is rounded to a rupee and capped at the bill', () => {
    expect(discountFor(3333, { kind: 'PERCENT', value: 10 })).toBe(333);
    expect(discountFor(1000, { kind: 'PERCENT', value: 150 })).toBe(1000);
  });
  it('fixed is capped at the bill; none means zero', () => {
    expect(discountFor(1000, { kind: 'FIXED', value: 400 })).toBe(400);
    expect(discountFor(1000, { kind: 'FIXED', value: 5000 })).toBe(1000);
    expect(discountFor(1000, null)).toBe(0);
    expect(discountFor(0, { kind: 'FIXED', value: 10 })).toBe(0);
  });
});

describe('status and balance', () => {
  it('computes net, balance and status', () => {
    expect(netAmount(5000, 500)).toBe(4500);
    expect(balanceOf(5000, 500, 1500)).toBe(3000);
    expect(statusFor(5000, 500, 0)).toBe('UNPAID');
    expect(statusFor(5000, 500, 1500)).toBe('PARTIAL');
    expect(statusFor(5000, 500, 4500)).toBe('PAID');
    expect(statusFor(1000, 1000, 0)).toBe('PAID');
  });
  it('overdue only after the due date and only with a balance', () => {
    expect(isOverdue('2026-11-03', '2026-11-04', 100)).toBe(true);
    expect(isOverdue('2026-11-04', '2026-11-04', 100)).toBe(false);
    expect(isOverdue('2026-11-03', '2026-11-04', 0)).toBe(false);
  });
});

describe('helpers', () => {
  it('validates periods and formats numbers', () => {
    expect(validPeriod('2026-11')).toBe(true);
    expect(validPeriod('2026-13')).toBe(false);
    expect(validPeriod('2026-1')).toBe(false);
    expect(formatNo('V', 42)).toBe('V-000042');
    expect(formatNo('R', 1)).toBe('R-000001');
  });
  it('totals ignore cancelled vouchers', () => {
    const r = outstanding([
      { totalAmount: 5000, discountAmount: 500, paidAmount: 1500, status: 'PARTIAL', dueDate: '2026-10-10' },
      { totalAmount: 5000, discountAmount: 0, paidAmount: 5000, status: 'PAID', dueDate: '2026-10-10' },
      { totalAmount: 9999, discountAmount: 0, paidAmount: 0, status: 'CANCELLED', dueDate: '2026-10-10' },
    ], '2026-11-04');
    expect(r).toEqual({ billed: 9500, collected: 6500, balance: 3000, overdueBalance: 3000 });
  });
});

describe('outstandingFromSums matches outstanding() (the database-totals version of the fee summary)', () => {
  it('gives identical numbers for many generated voucher sets', () => {
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    for (let round = 0; round < 200; round++) {
      const rows = Array.from({ length: rnd(40) }, () => {
        const totalAmount = 500 * (1 + rnd(20)); const discountAmount = rnd(3) === 0 ? rnd(totalAmount / 2) : 0; const net = totalAmount - discountAmount;
        const paidAmount = [0, net, Math.floor(net / 2)][rnd(3)]!;
        const status = rnd(8) === 0 ? 'CANCELLED' as const : paidAmount >= net ? 'PAID' as const : paidAmount > 0 ? 'PARTIAL' as const : 'UNPAID' as const;
        return { totalAmount, discountAmount, paidAmount, status, dueDate: rnd(2) === 0 ? '2026-10-10' : '2026-12-10' };
      });
      const today = '2026-11-04';
      const live = rows.filter((r) => r.status !== 'CANCELLED');
      const sum = (l: typeof rows) => ({ total: l.reduce((n, r) => n + r.totalAmount, 0), discount: l.reduce((n, r) => n + r.discountAmount, 0), paid: l.reduce((n, r) => n + r.paidAmount, 0) });
      expect(outstandingFromSums(sum(live), sum(live.filter((r) => r.dueDate < today)))).toEqual(outstanding(rows, today));
    }
  });
  it('is zero for an empty school', () => {
    expect(outstandingFromSums({ total: 0, discount: 0, paid: 0 }, { total: 0, discount: 0, paid: 0 })).toEqual({ billed: 0, collected: 0, balance: 0, overdueBalance: 0 });
  });
});
