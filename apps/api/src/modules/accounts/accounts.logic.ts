/** Pure accounts rules (no database). Money is whole rupees. */
export type LedgerKind = 'INCOME' | 'EXPENSE';
export const LEDGER_KINDS: readonly LedgerKind[] = ['INCOME', 'EXPENSE'];

/** Counter key in school_counters for each kind (numbers run separately: INC-000001, EXP-000001). */
export const counterKey = (kind: LedgerKind): string => (kind === 'INCOME' ? 'account_income_no' : 'account_expense_no');
export const formatEntryNo = (kind: LedgerKind, n: number): string => `${kind === 'INCOME' ? 'INC' : 'EXP'}-${String(n).padStart(6, '0')}`;

/** Categories offered by "Add common categories". Names are in English; schools can rename by adding their own. */
export const DEFAULT_CATEGORIES: readonly { kind: LedgerKind; name: string }[] = [
  { kind: 'INCOME', name: 'Donations' },
  { kind: 'INCOME', name: 'Canteen' },
  { kind: 'INCOME', name: 'Events and fundraising' },
  { kind: 'INCOME', name: 'Other income' },
  { kind: 'EXPENSE', name: 'Salaries' },
  { kind: 'EXPENSE', name: 'Electricity, gas and water' },
  { kind: 'EXPENSE', name: 'Rent' },
  { kind: 'EXPENSE', name: 'Stationery and supplies' },
  { kind: 'EXPENSE', name: 'Repairs and maintenance' },
  { kind: 'EXPENSE', name: 'Events' },
  { kind: 'EXPENSE', name: 'Other expenses' },
];

export const validMonthKey = (m: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
export const validYear = (y: string): boolean => /^\d{4}$/.test(y) && Number(y) >= 2000 && Number(y) <= 2100;

export interface EntryLike { kind: LedgerKind; categoryId: string; amount: number }
export interface CategoryTotal { categoryId: string; name: string; amount: number; entries: number }
export interface LedgerSummary {
  feeIncome: number; otherIncome: number; totalIncome: number; expenses: number; net: number;
  incomeByCategory: CategoryTotal[]; expenseByCategory: CategoryTotal[];
}

/** Totals of non-voided entries plus the fee money collected in the same range. Category lists are biggest first (ties by name). */
export function summarize(entries: EntryLike[], names: Map<string, string>, feeIncome: number): LedgerSummary {
  const by = { INCOME: new Map<string, CategoryTotal>(), EXPENSE: new Map<string, CategoryTotal>() };
  for (const e of entries) {
    const m = by[e.kind];
    const cur = m.get(e.categoryId) ?? { categoryId: e.categoryId, name: names.get(e.categoryId) ?? '', amount: 0, entries: 0 };
    cur.amount += e.amount; cur.entries += 1;
    m.set(e.categoryId, cur);
  }
  const list = (m: Map<string, CategoryTotal>) => [...m.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  const incomeByCategory = list(by.INCOME);
  const expenseByCategory = list(by.EXPENSE);
  const otherIncome = incomeByCategory.reduce((n, c) => n + c.amount, 0);
  const expenses = expenseByCategory.reduce((n, c) => n + c.amount, 0);
  return { feeIncome, otherIncome, totalIncome: feeIncome + otherIncome, expenses, net: feeIncome + otherIncome - expenses, incomeByCategory, expenseByCategory };
}

export interface MonthRow { month: string; feeIncome: number; otherIncome: number; expenses: number; net: number }
/** Twelve rows (YYYY-01 ... YYYY-12). `fee` and `entries` carry a YYYY-MM-DD (or ISO) date; anything outside `year` is ignored. */
export function monthlySeries(year: number, fee: { date: string; amount: number }[], entries: { date: string; kind: LedgerKind; amount: number }[]): MonthRow[] {
  const rows: MonthRow[] = Array.from({ length: 12 }, (_, i) => ({ month: `${year}-${String(i + 1).padStart(2, '0')}`, feeIncome: 0, otherIncome: 0, expenses: 0, net: 0 }));
  const at = (date: string): MonthRow | undefined => (date.slice(0, 4) === String(year) ? rows[Number(date.slice(5, 7)) - 1] : undefined);
  for (const f of fee) { const r = at(f.date); if (r) r.feeIncome += f.amount; }
  for (const e of entries) { const r = at(e.date); if (r) { if (e.kind === 'INCOME') r.otherIncome += e.amount; else r.expenses += e.amount; } }
  for (const r of rows) r.net = r.feeIncome + r.otherIncome - r.expenses;
  return rows;
}
