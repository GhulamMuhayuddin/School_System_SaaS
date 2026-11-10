import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { PaymentMethod } from '@/features/fees/fees-api';

export { fmtMoney, parseRupees } from '@/features/fees/fees-api';
export type { PaymentMethod };
export type LedgerKind = 'INCOME' | 'EXPENSE';
export interface AccountCategory { id: string; kind: LedgerKind; name: string; isActive: boolean }
export interface LedgerEntry {
  id: string; entryNo: string; kind: LedgerKind; category: { id: string; name: string }; amount: number; method: PaymentMethod;
  entryDate: string; description: string; party: string | null; reference: string | null; voided: boolean; voidReason: string | null; createdAt: string;
}
export interface EntryList { entries: LedgerEntry[]; income: number; expense: number; truncated: boolean }
export interface EntryFilter { kind?: LedgerKind | ''; categoryId?: string; from?: string; to?: string; includeVoided?: boolean }
export interface NewEntry { kind: LedgerKind; categoryId: string; amount: number; method: PaymentMethod; entryDate: string; description: string; party: string | null; reference: string | null }
export interface CategoryTotal { categoryId: string; name: string; amount: number; entries: number }
export interface AccountSummary {
  from: string; to: string; feeIncome: number; otherIncome: number; totalIncome: number; expenses: number; net: number;
  incomeByCategory: CategoryTotal[]; expenseByCategory: CategoryTotal[];
}
export interface MonthRow { month: string; feeIncome: number; otherIncome: number; expenses: number; net: number }

/** Today as YYYY-MM-DD (the same convention the fee reports use). */
export const todayText = (now: Date = new Date()): string => now.toISOString().slice(0, 10);
export const monthStartText = (now: Date = new Date()): string => `${todayText(now).slice(0, 7)}-01`;
/** Net result of a list: income minus expense. */
export const balanceOf = (income: number, expense: number): number => income - expense;
export const kindTone = (k: LedgerKind): 'success' | 'warning' => (k === 'INCOME' ? 'success' : 'warning');

const qs = (o: Record<string, string | boolean | undefined>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const useCategories = (kind?: LedgerKind) =>
  useQuery({ queryKey: ['accounts', 'categories', kind ?? 'all'], queryFn: () => apiFetch<AccountCategory[]>(`/accounts/categories${qs({ kind })}`) });
export const useEntries = (f: EntryFilter) =>
  useQuery({ queryKey: ['accounts', 'entries', f], queryFn: () => apiFetch<EntryList>(`/accounts/entries${qs({ ...f })}`) });
export const useAccountSummary = (from: string, to: string) =>
  useQuery({ queryKey: ['accounts', 'summary', from, to], queryFn: () => apiFetch<AccountSummary>(`/accounts/reports/summary${qs({ from, to })}`) });
export const useMonthly = (year: string) =>
  useQuery({ queryKey: ['accounts', 'monthly', year], enabled: year !== '', queryFn: () => apiFetch<{ year: number; months: MonthRow[] }>(`/accounts/reports/monthly${qs({ year })}`) });

function useRefreshing<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }) });
}
export const useCreateCategory = () => useRefreshing((v: { kind: LedgerKind; name: string }) => apiFetch<AccountCategory>('/accounts/categories', { method: 'POST', body: v }));
export const useUpdateCategory = () => useRefreshing((v: { id: string; name?: string; isActive?: boolean }) => apiFetch<AccountCategory>(`/accounts/categories/${v.id}`, { method: 'PATCH', body: { name: v.name, isActive: v.isActive } }));
export const useAddDefaultCategories = () => useRefreshing(() => apiFetch<{ created: number }>('/accounts/categories/defaults', { method: 'POST' }));
export const useCreateEntry = () => useRefreshing((v: NewEntry) => apiFetch<LedgerEntry>('/accounts/entries', { method: 'POST', body: v }));
export const useVoidEntry = () => useRefreshing((v: { id: string; reason: string }) => apiFetch<LedgerEntry>(`/accounts/entries/${v.id}/void`, { method: 'POST', body: { reason: v.reason } }));
