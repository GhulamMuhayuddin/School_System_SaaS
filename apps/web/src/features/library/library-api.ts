import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type CopyStatus = 'AVAILABLE' | 'ISSUED' | 'LOST' | 'WITHDRAWN';
export type LoanState = 'OPEN' | 'OVERDUE' | 'RETURNED';
export type FineStatus = 'NONE' | 'UNPAID' | 'PAID' | 'WAIVED';
export type LoanStatusFilter = 'open' | 'overdue' | 'returned' | 'all';

export interface LibrarySettings { loanDays: number; finePerDay: number; maxBooksStudent: number }
export interface BookCounts { total: number; available: number; issued: number; lost: number; withdrawn: number }
export interface Book { id: string; title: string; author: string; isbn: string | null; category: string | null; publisher: string | null; language: string | null; location: string | null; active: boolean; counts: BookCounts }
export interface BorrowerRef { id: string; name: string; admissionNo: string }
export interface Copy { id: string; accessionNo: string; status: CopyStatus; loan: { id: string; student: BorrowerRef; dueOn: string; overdue: boolean } | null }
export interface BookDetail extends Book { copies: Copy[] }
export interface Loan {
  id: string; copy: { id: string; accessionNo: string }; book: { id: string; title: string; author: string }; student: BorrowerRef & { className: string | null };
  issuedOn: string; dueOn: string; returnedOn: string | null; renewals: number; state: LoanState; overdueDays: number; fine: number; fineStatus: FineStatus;
}
export interface LibrarySummary { books: number; copies: number; available: number; issued: number; overdue: number; unpaidFines: { count: number; amount: number } }
export interface StudentLibrary { loans: Loan[]; unpaidFine: number }
export interface BookValues { title: string; author: string; isbn: string | null; category: string | null; publisher: string | null; language: string | null; location: string | null }

const qs = (o: Record<string, string | boolean | undefined>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const useLibrarySummary = () => useQuery({ queryKey: ['library', 'summary'], queryFn: () => apiFetch<LibrarySummary>('/library/summary') });
export const useLibrarySettings = () => useQuery({ queryKey: ['library', 'settings'], queryFn: () => apiFetch<LibrarySettings>('/library/settings') });
export const useBooks = (f: { category?: string; available?: boolean; includeInactive?: boolean }) =>
  useQuery({ queryKey: ['library', 'books', f], queryFn: () => apiFetch<{ books: Book[]; categories: string[]; truncated: boolean }>(`/library/books${qs({ ...f })}`) });
export const useBook = (id: string | null) => useQuery({ queryKey: ['library', 'book', id], enabled: Boolean(id), queryFn: () => apiFetch<BookDetail>(`/library/books/${id}`) });
export const useLoans = (f: { status: LoanStatusFilter }) =>
  useQuery({ queryKey: ['library', 'loans', f], queryFn: () => apiFetch<{ loans: Loan[]; truncated: boolean }>(`/library/loans${qs({ ...f })}`) });

/** Everything in the library depends on everything else (counts, copies, loans, fines), so any change refreshes it all. */
function useRefreshing<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['library'] }) });
}
export const useCreateBook = () => useRefreshing((v: BookValues & { copies: number }) => apiFetch<BookDetail>('/library/books', { method: 'POST', body: v }));
export const useUpdateBook = () => useRefreshing((v: { id: string; patch: Partial<BookValues> & { active?: boolean } }) => apiFetch<BookDetail>(`/library/books/${v.id}`, { method: 'PATCH', body: v.patch }));
export const useAddCopies = () => useRefreshing((v: { id: string; count: number }) => apiFetch<BookDetail>(`/library/books/${v.id}/copies`, { method: 'POST', body: { count: v.count } }));
export const useSetCopyStatus = () => useRefreshing((v: { id: string; status: Exclude<CopyStatus, 'ISSUED'> }) => apiFetch<BookDetail>(`/library/copies/${v.id}`, { method: 'PATCH', body: { status: v.status } }));
export const useIssue = () => useRefreshing((v: { accessionNo: string; studentId: string; dueOn?: string }) => apiFetch<Loan>('/library/loans', { method: 'POST', body: v }));
export const useReturnLoan = () => useRefreshing((id: string) => apiFetch<Loan>(`/library/loans/${id}/return`, { method: 'POST' }));
export const useRenewLoan = () => useRefreshing((id: string) => apiFetch<Loan>(`/library/loans/${id}/renew`, { method: 'POST' }));
export const useSettleFine = () => useRefreshing((v: { id: string; action: 'PAID' | 'WAIVED' }) => apiFetch<Loan>(`/library/loans/${v.id}/fine`, { method: 'POST', body: { action: v.action } }));
export const useSaveLibrarySettings = () => useRefreshing((v: LibrarySettings) => apiFetch<LibrarySettings>('/library/settings', { method: 'PUT', body: v }));

export const copyTone = (s: CopyStatus): 'success' | 'warning' | 'danger' | 'neutral' => (s === 'AVAILABLE' ? 'success' : s === 'ISSUED' ? 'warning' : s === 'LOST' ? 'danger' : 'neutral');
export const loanTone = (s: LoanState): 'success' | 'warning' | 'danger' => (s === 'RETURNED' ? 'success' : s === 'OVERDUE' ? 'danger' : 'warning');

/** Validates the settings text fields: whole numbers inside the server's limits. */
export function parseSettings(v: { loanDays: string; finePerDay: string; maxBooksStudent: string }): LibrarySettings | null {
  const n = (s: string, lo: number, hi: number): number | null => (/^\d{1,4}$/.test(s.trim()) && Number(s) >= lo && Number(s) <= hi ? Number(s) : null);
  const loanDays = n(v.loanDays, 1, 90); const finePerDay = n(v.finePerDay, 0, 1000); const maxBooksStudent = n(v.maxBooksStudent, 1, 20);
  return loanDays === null || finePerDay === null || maxBooksStudent === null ? null : { loanDays, finePerDay, maxBooksStudent };
}
