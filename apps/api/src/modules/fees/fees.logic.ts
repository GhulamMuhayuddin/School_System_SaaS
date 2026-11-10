/** Pure fee rules (no database). Money is whole rupees. */
export type VoucherStatusKey = 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
export interface Concession { kind: 'PERCENT' | 'FIXED'; value: number }

/** Discount on a bill: PERCENT of it (rounded to a rupee) or a FIXED amount; never more than the bill. */
export function discountFor(subtotal: number, c: Concession | null): number {
  if (!c || subtotal <= 0) return 0;
  const raw = c.kind === 'PERCENT' ? Math.round((subtotal * Math.min(c.value, 100)) / 100) : c.value;
  return Math.max(0, Math.min(raw, subtotal));
}

export const netAmount = (total: number, discount: number): number => Math.max(0, total - discount);
export const balanceOf = (total: number, discount: number, paid: number): number => Math.max(0, netAmount(total, discount) - paid);

/** UNPAID / PARTIAL / PAID from the amounts. CANCELLED is set explicitly, never computed. */
export function statusFor(total: number, discount: number, paid: number): Exclude<VoucherStatusKey, 'CANCELLED'> {
  const net = netAmount(total, discount);
  if (net === 0 || paid >= net) return 'PAID';
  return paid > 0 ? 'PARTIAL' : 'UNPAID';
}

/** A voucher is overdue when something is still owed after its due date (today itself is not overdue). */
export const isOverdue = (dueDate: string, today: string, balance: number): boolean => balance > 0 && dueDate < today;

export const validPeriod = (p: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
export const formatNo = (prefix: 'V' | 'R', n: number): string => `${prefix}-${String(n).padStart(6, '0')}`;
export const periodLabel = (p: string): string => p;

/** Sums over a set of (not cancelled) vouchers, as the database adds them up. */
export interface VoucherSums { total: number; discount: number; paid: number }
/**
 * Same numbers as outstanding(), but from database totals instead of every voucher row (a school has a voucher per student per month, so the
 * row list grows for ever). Equal to outstanding() whenever no voucher has been paid more than it is worth, which payment entry guarantees.
 * `late` = the same sums for vouchers whose due date has passed.
 */
export function outstandingFromSums(all: VoucherSums, late: VoucherSums): { billed: number; collected: number; balance: number; overdueBalance: number } {
  const billed = Math.max(0, all.total - all.discount);
  return {
    billed, collected: all.paid, balance: Math.max(0, billed - all.paid),
    overdueBalance: Math.max(0, late.total - late.discount - late.paid),
  };
}

export interface VoucherLike { totalAmount: number; discountAmount: number; paidAmount: number; status: VoucherStatusKey; dueDate: string }
/** Totals for reports; cancelled vouchers are ignored. */
export function outstanding(vouchers: VoucherLike[], today: string): { billed: number; collected: number; balance: number; overdueBalance: number } {
  let billed = 0, collected = 0, balance = 0, overdueBalance = 0;
  for (const v of vouchers) {
    if (v.status === 'CANCELLED') continue;
    const net = netAmount(v.totalAmount, v.discountAmount);
    const b = balanceOf(v.totalAmount, v.discountAmount, v.paidAmount);
    billed += net; collected += v.paidAmount; balance += b;
    if (isOverdue(v.dueDate, today, b)) overdueBalance += b;
  }
  return { billed, collected, balance, overdueBalance };
}
