/** Pure inventory rules (no database). */
export const MAX_QTY = 1_000_000;
export const MAX_STOCK = 10_000_000;
export const MAX_COST = 10_000_000;
export type StockKindValue = 'IN' | 'OUT' | 'ADJUST';
export const ITEM_COUNTER = 'inventory_item_no';
export const itemCode = (n: number): string => `I-${String(n).padStart(6, '0')}`;

export type StockResult = { ok: true; delta: number; balance: number } | { ok: false; reason: 'INVALID' | 'INSUFFICIENT' | 'NO_CHANGE' | 'TOO_MUCH' };
/**
 * IN adds `quantity`, OUT removes it (never below zero), ADJUST means `quantity` is the number counted on the shelf
 * (the change is counted minus what the system had; counting the same number is refused as pointless).
 */
export function applyStock(current: number, kind: StockKindValue, quantity: number): StockResult {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QTY) return { ok: false, reason: 'INVALID' };
  if (kind === 'ADJUST') {
    const delta = quantity - current;
    return delta === 0 ? { ok: false, reason: 'NO_CHANGE' } : { ok: true, delta, balance: quantity };
  }
  if (quantity < 1) return { ok: false, reason: 'INVALID' };
  if (kind === 'OUT') return quantity > current ? { ok: false, reason: 'INSUFFICIENT' } : { ok: true, delta: -quantity, balance: current - quantity };
  return current + quantity > MAX_STOCK ? { ok: false, reason: 'TOO_MUCH' } : { ok: true, delta: quantity, balance: current + quantity };
}

/** Low = a reorder level is set and the stock is at or below it. */
export const isLow = (quantity: number, reorderLevel: number): boolean => reorderLevel > 0 && quantity <= reorderLevel;
export const stockValue = (quantity: number, unitCost: number): number => Math.max(0, quantity) * Math.max(0, unitCost);
/** Names and categories are compared tidy: spaces trimmed, blank means none. */
export const tidy = (v: string | null | undefined): string | null => (v === undefined || v === null || v.trim() === '' ? null : v.trim());
