import { z } from 'zod';
import { isRealDay } from '../../utils/dates';
import { MAX_COST, MAX_QTY } from './inventory.logic';

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().optional();
const day = z.string().refine(isRealDay, 'Use a real date written YYYY-MM-DD');
const qty = z.number().int().min(0).max(MAX_QTY);
const cost = z.number().int().min(0).max(MAX_COST);
const kind = z.enum(['IN', 'OUT', 'ADJUST']);
const flag = z.enum(['true', 'false']);

export const idParam = z.object({ id: uuid });
export const itemQuery = z.object({ q: z.string().trim().max(60).optional(), category: z.string().trim().max(60).optional(), lowOnly: flag.optional(), includeInactive: flag.optional() });
export const movementQuery = z.object({ itemId: uuid.optional(), kind: kind.optional(), from: day.optional(), to: day.optional() });
export const itemBody = z.object({
  name: z.string().trim().min(2).max(80), category: text(60), unit: z.string().trim().min(1).max(20).optional(), reorderLevel: qty.optional(), unitCost: cost.optional(),
  location: text(80), notes: text(300), openingQuantity: qty.optional(),
});
export const itemPatch = itemBody.omit({ openingQuantity: true }).partial().extend({ active: z.boolean().optional() }).refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export const stockBody = z.object({ kind, quantity: qty, unitCost: cost.optional(), party: text(80), reference: text(60), note: text(300), movedOn: day.optional() });
