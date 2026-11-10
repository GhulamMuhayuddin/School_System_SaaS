import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type StockKind = 'IN' | 'OUT' | 'ADJUST';
export const STOCK_KINDS: StockKind[] = ['IN', 'OUT', 'ADJUST'];
export interface Item {
  id: string; code: string; name: string; category: string | null; unit: string; quantity: number; reorderLevel: number; unitCost: number; value: number;
  low: boolean; location: string | null; notes: string | null; active: boolean;
}
export interface Movement {
  id: string; item: { id: string; code: string; name: string; unit: string }; kind: StockKind; delta: number; balanceAfter: number; unitCost: number | null;
  party: string | null; reference: string | null; note: string | null; movedOn: string; createdAt: string;
}
export interface Summary { items: number; lowItems: number; outOfStock: number; totalValue: number }
export interface ItemValues { name: string; category: string | null; unit: string; reorderLevel: number; unitCost: number; location: string | null; notes: string | null }
export interface StockValues { kind: StockKind; quantity: number; unitCost?: number; party: string | null; reference: string | null; note: string | null; movedOn: string }

export const MAX_QTY = 1_000_000;
/** Whole quantity from 0 to 1,000,000; null when the text is not such a number. */
export function parseQty(text: string): number | null {
  const v = text.trim().replace(/,/g, '');
  return /^\d{1,7}$/.test(v) && Number(v) <= MAX_QTY ? Number(v) : null;
}
/** Whole rupees: blank = 0, digits with optional commas up to 10,000,000; anything else is null. */
export function parseCost(text: string): number | null {
  const v = text.trim().replace(/,/g, '');
  if (v === '') return 0;
  return /^\d{1,8}$/.test(v) && Number(v) <= 10_000_000 ? Number(v) : null;
}
/** The stock after a movement (same rule as the server); null when it would be refused. */
export function stockAfter(current: number, kind: StockKind, quantity: number | null): number | null {
  if (quantity === null) return null;
  if (kind === 'ADJUST') return quantity === current ? null : quantity;
  if (quantity < 1) return null;
  if (kind === 'OUT') return quantity > current ? null : current - quantity;
  return current + quantity;
}
export const stockTone = (i: Pick<Item, 'quantity' | 'low'>): 'danger' | 'warning' | 'success' => (i.quantity === 0 ? 'danger' : i.low ? 'warning' : 'success');
export const deltaText = (n: number): string => (n > 0 ? `+${n}` : String(n));

const qs = (o: Record<string, string | boolean | undefined>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const useInventorySummary = () => useQuery({ queryKey: ['inventory', 'summary'], queryFn: () => apiFetch<Summary>('/inventory/summary') });
export const useCategories = () => useQuery({ queryKey: ['inventory', 'categories'], queryFn: async () => (await apiFetch<{ categories: string[] }>('/inventory/categories')).categories });
export const useItems = (f: { q?: string; category?: string; lowOnly?: boolean; includeInactive?: boolean }) =>
  useQuery({ queryKey: ['inventory', 'items', f], queryFn: () => apiFetch<{ items: Item[]; truncated: boolean }>(`/inventory/items${qs({ ...f })}`) });
export const useMovements = (f: { kind?: StockKind; from?: string; to?: string }) =>
  useQuery({ queryKey: ['inventory', 'movements', f], queryFn: () => apiFetch<{ movements: Movement[]; truncated: boolean }>(`/inventory/movements${qs({ ...f })}`) });

/** Items, movements, the summary and categories all depend on each other, so any change refreshes everything inventory. */
function useRefreshing<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }) });
}
export const useCreateItem = () => useRefreshing((v: ItemValues & { openingQuantity: number }) => apiFetch<Item>('/inventory/items', { method: 'POST', body: v }));
export const useUpdateItem = () => useRefreshing((v: { id: string; patch: Partial<ItemValues> & { active?: boolean } }) => apiFetch<Item>(`/inventory/items/${v.id}`, { method: 'PATCH', body: v.patch }));
export const useMoveStock = () => useRefreshing((v: { id: string; values: StockValues }) => apiFetch<{ item: Item }>(`/inventory/items/${v.id}/stock`, { method: 'POST', body: v.values }));
