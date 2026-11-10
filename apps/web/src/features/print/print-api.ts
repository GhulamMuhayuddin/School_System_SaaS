import { useQueries, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Letterhead } from '@/components/print/print-frame';
import type { Payment, VoucherDetail } from '@/features/fees/fees-api';

export type PrintT = (key: string, options?: Record<string, unknown>) => string;

/** The school's own name and address for the top of a printout (any signed-in member of the school may read it). */
export const useLetterhead = () => useQuery({ queryKey: ['school', 'letterhead'], queryFn: async () => (await apiFetch<{ letterhead: Letterhead }>('/school/letterhead')).letterhead, staleTime: 5 * 60_000 });
export const usePayment = (id: string) => useQuery({ queryKey: ['fees', 'payment', id], queryFn: () => apiFetch<Payment>(`/fees/payments/${id}`) });

/** At most this many vouchers are printed in one go; the page says so when the filter matches more. */
export const BULK_VOUCHER_LIMIT = 100;

/** Details (items and receipts) of many vouchers, one request each. */
export function useVoucherDetails(ids: string[]) {
  return useQueries({ queries: ids.map((id) => ({ queryKey: ['fees', 'voucher', id], queryFn: () => apiFetch<VoucherDetail>(`/fees/vouchers/${id}`) })) });
}

/** Result label key for a subject line: absent, not entered, pass or fail. */
export function subjectOutcome(s: { entered: boolean; absent: boolean; passed: boolean | null }): 'absent' | 'pending' | 'pass' | 'fail' {
  if (!s.entered) return 'pending';
  if (s.absent) return 'absent';
  return s.passed ? 'pass' : 'fail';
}
