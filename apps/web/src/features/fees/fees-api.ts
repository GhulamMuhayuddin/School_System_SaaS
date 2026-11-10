import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type VoucherStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'BANK' | 'ONLINE';
export type FeeFrequency = 'MONTHLY' | 'ONE_TIME';
export interface FeeHead { id: string; name: string; isActive: boolean }
export interface StructureItem { feeHeadId: string; feeHeadName: string; amount: number; frequency: FeeFrequency }
export interface ClassStructure { sessionId: string; sessionName: string; classId: string; items: StructureItem[]; monthlyTotal: number; oneTimeTotal: number }
export interface Voucher {
  id: string; voucherNo: string; period: string; dueDate: string; status: VoucherStatus; overdue: boolean;
  student: { id: string; admissionNo: string; name: string }; className: string; sectionName: string | null;
  totalAmount: number; discountAmount: number; netAmount: number; paidAmount: number; balance: number;
}
export interface Payment {
  id: string; receiptNo: string; voucherId: string; voucherNo: string; amount: number; method: PaymentMethod; reference: string | null;
  paidAt: string; voided: boolean; voidReason: string | null; student: { id: string; admissionNo: string; name: string }; period: string;
}
export interface VoucherDetail extends Voucher { items: { id: string; description: string; amount: number }[]; payments: Payment[]; cancelReason: string | null }
export interface VoucherFilter { classId?: string; studentId?: string; status?: VoucherStatus | ''; period?: string; q?: string; overdue?: boolean }
export type ConcessionKind = 'PERCENT' | 'FIXED';
export interface Concession { studentId: string; sessionId: string; kind: ConcessionKind; value: number; reason: string | null }
export interface GenerateResult { created: number; skippedExisting: number; students: number; totalBilled: number }
export interface FeeSummary {
  from: string; to: string; collected: number; receipts: number; byMethod: { method: PaymentMethod; amount: number }[];
  billed: number; totalCollected: number; balance: number; overdueBalance: number;
}
export interface Defaulter { student: { id: string; admissionNo: string; name: string }; className: string; sectionName: string | null; vouchers: number; balance: number; oldestDueDate: string }

export const fmtMoney = (n: number, lang: string): string => `Rs ${n.toLocaleString(lang === 'ur' ? 'ur-PK' : 'en-PK')}`;
/** Current month as YYYY-MM (local time), the default billing period. */
export const currentPeriod = (now: Date = new Date()): string => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
/** Parses a typed rupee amount: digits only. Returns null when it is not a positive whole number. */
export function parseRupees(text: string): number | null {
  const v = text.trim().replace(/,/g, '');
  if (!/^\d{1,9}$/.test(v)) return null;
  const n = Number(v);
  return n > 0 ? n : null;
}
/** Parses a typed concession value: a whole number, 1-100 for a percentage, any positive rupee amount for a fixed one. */
export function parseConcession(kind: ConcessionKind, text: string): number | null {
  const n = parseRupees(text);
  if (n === null) return null;
  return kind === 'PERCENT' && n > 100 ? null : n;
}
export const concessionLabel = (c: Pick<Concession, 'kind' | 'value'>, lang: string): string => (c.kind === 'PERCENT' ? `${c.value}%` : fmtMoney(c.value, lang));
export const statusTone = (s: VoucherStatus, overdue: boolean): 'success' | 'warning' | 'danger' | 'neutral' =>
  s === 'PAID' ? 'success' : s === 'CANCELLED' ? 'neutral' : overdue ? 'danger' : 'warning';

const qs = (o: Record<string, string | boolean | undefined>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const useFeeHeads = () => useQuery({ queryKey: ['fees', 'heads'], queryFn: () => apiFetch<FeeHead[]>('/fees/heads') });
export const useStructure = (classId: string | undefined) =>
  useQuery({ queryKey: ['fees', 'structure', classId], enabled: Boolean(classId), queryFn: () => apiFetch<ClassStructure>(`/fees/structure/${classId}`) });
export const useVouchers = (f: VoucherFilter) => useQuery({ queryKey: ['fees', 'vouchers', f], queryFn: () => apiFetch<Voucher[]>(`/fees/vouchers${qs({ ...f })}`) });
export const useVoucher = (id: string | null) => useQuery({ queryKey: ['fees', 'voucher', id], enabled: Boolean(id), queryFn: () => apiFetch<VoucherDetail>(`/fees/vouchers/${id}`) });
export const useConcession = (studentId: string) =>
  useQuery({ queryKey: ['fees', 'concession', studentId], queryFn: async () => (await apiFetch<{ concession: Concession | null }>(`/fees/concessions/${studentId}`)).concession });
export const useFeeSummary = (from: string, to: string) => useQuery({ queryKey: ['fees', 'summary', from, to], queryFn: () => apiFetch<FeeSummary>(`/fees/reports/summary${qs({ from, to })}`) });
export const useDefaulters = (classId: string) => useQuery({ queryKey: ['fees', 'defaulters', classId], queryFn: () => apiFetch<Defaulter[]>(`/fees/reports/defaulters${qs({ classId })}`) });

function useRefreshing<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['fees'] }) });
}
export const useCreateHead = () => useRefreshing((name: string) => apiFetch<FeeHead>('/fees/heads', { method: 'POST', body: { name } }));
export const useUpdateHead = () => useRefreshing((v: { id: string; name?: string; isActive?: boolean }) => apiFetch<FeeHead>(`/fees/heads/${v.id}`, { method: 'PATCH', body: { name: v.name, isActive: v.isActive } }));
export const useSetStructure = (classId: string) =>
  useRefreshing((items: { feeHeadId: string; amount: number; frequency: FeeFrequency }[]) => apiFetch<ClassStructure>(`/fees/structure/${classId}`, { method: 'PUT', body: { items } }));
export const useGenerate = () =>
  useRefreshing((v: { classId: string; sectionId?: string; period: string; dueDate: string; includeOneTime: boolean; includeTransport?: boolean; includeHostel?: boolean }) => apiFetch<GenerateResult>('/fees/vouchers/generate', { method: 'POST', body: v }));
export const usePay = (voucherId: string) =>
  useRefreshing((v: { amount: number; method: PaymentMethod; reference: string | null }) => apiFetch<Payment>(`/fees/vouchers/${voucherId}/payments`, { method: 'POST', body: v }));
export const useVoidPayment = () => useRefreshing((v: { id: string; reason: string }) => apiFetch<Payment>(`/fees/payments/${v.id}/void`, { method: 'POST', body: { reason: v.reason } }));
export const useCancelVoucher = () => useRefreshing((v: { id: string; reason: string }) => apiFetch<VoucherDetail>(`/fees/vouchers/${v.id}/cancel`, { method: 'POST', body: { reason: v.reason } }));
export const useSetConcession = (studentId: string) =>
  useRefreshing((v: { kind: ConcessionKind; value: number; reason: string | null }) => apiFetch<Concession>(`/fees/concessions/${studentId}`, { method: 'PUT', body: v }));
export const useRemoveConcession = (studentId: string) => useRefreshing(() => apiFetch<void>(`/fees/concessions/${studentId}`, { method: 'DELETE' }));
