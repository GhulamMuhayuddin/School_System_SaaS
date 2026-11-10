import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES, counterKey, formatEntryNo, monthlySeries, summarize, validMonthKey, validYear } from '../src/modules/accounts/accounts.logic';

describe('entry numbers', () => {
  it('uses separate prefixes and counters for income and expense', () => {
    expect(formatEntryNo('INCOME', 7)).toBe('INC-000007');
    expect(formatEntryNo('EXPENSE', 123456)).toBe('EXP-123456');
    expect(counterKey('INCOME')).not.toBe(counterKey('EXPENSE'));
  });
});

describe('validation helpers', () => {
  it('checks months and years', () => {
    expect(validMonthKey('2026-11')).toBe(true);
    expect(validMonthKey('2026-13')).toBe(false);
    expect(validYear('2026')).toBe(true);
    expect(validYear('1999')).toBe(false);
    expect(validYear('20266')).toBe(false);
  });
  it('default categories have no duplicate names per kind', () => {
    const keys = DEFAULT_CATEGORIES.map((c) => `${c.kind}:${c.name.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('summarize', () => {
  const names = new Map([['don', 'Donations'], ['can', 'Canteen'], ['rent', 'Rent'], ['util', 'Utilities']]);
  it('adds fee income, groups by category, biggest first, and computes net', () => {
    const s = summarize([
      { kind: 'INCOME', categoryId: 'don', amount: 5000 }, { kind: 'INCOME', categoryId: 'can', amount: 1200 }, { kind: 'INCOME', categoryId: 'don', amount: 800 },
      { kind: 'EXPENSE', categoryId: 'rent', amount: 20000 }, { kind: 'EXPENSE', categoryId: 'util', amount: 3500 },
    ], names, 40000);
    expect(s.otherIncome).toBe(7000);
    expect(s.totalIncome).toBe(47000);
    expect(s.expenses).toBe(23500);
    expect(s.net).toBe(23500);
    expect(s.incomeByCategory.map((c) => [c.name, c.amount, c.entries])).toEqual([['Donations', 5800, 2], ['Canteen', 1200, 1]]);
    expect(s.expenseByCategory.map((c) => c.name)).toEqual(['Rent', 'Utilities']);
  });
  it('can be negative and handles nothing at all', () => {
    expect(summarize([{ kind: 'EXPENSE', categoryId: 'rent', amount: 900 }], names, 0).net).toBe(-900);
    expect(summarize([], names, 0)).toMatchObject({ totalIncome: 0, expenses: 0, net: 0, incomeByCategory: [], expenseByCategory: [] });
  });
  it('breaks ties by name', () => {
    const s = summarize([{ kind: 'EXPENSE', categoryId: 'util', amount: 100 }, { kind: 'EXPENSE', categoryId: 'rent', amount: 100 }], names, 0);
    expect(s.expenseByCategory.map((c) => c.name)).toEqual(['Rent', 'Utilities']);
  });
});

describe('monthlySeries', () => {
  it('returns 12 months and places money in the right month, ignoring other years', () => {
    const rows = monthlySeries(2026,
      [{ date: '2026-01-15T10:00:00.000Z', amount: 1000 }, { date: '2026-01-31T23:00:00.000Z', amount: 500 }, { date: '2025-12-31T10:00:00.000Z', amount: 9999 }],
      [{ date: '2026-01-02', kind: 'INCOME', amount: 200 }, { date: '2026-03-10', kind: 'EXPENSE', amount: 700 }, { date: '2027-01-01', kind: 'EXPENSE', amount: 9999 }]);
    expect(rows).toHaveLength(12);
    expect(rows[0]).toEqual({ month: '2026-01', feeIncome: 1500, otherIncome: 200, expenses: 0, net: 1700 });
    expect(rows[2]).toEqual({ month: '2026-03', feeIncome: 0, otherIncome: 0, expenses: 700, net: -700 });
    expect(rows[11]?.month).toBe('2026-12');
    expect(rows.reduce((n, r) => n + r.net, 0)).toBe(1000);
  });
});
