import { z } from 'zod';
import { isRealDay } from '../../utils/dates';
import { validYear } from './accounts.logic';

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((v) => isRealDay(v), 'Invalid date');
const rupees = z.number().int().min(1, 'Amount must be above 0').max(100_000_000);
const text = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().optional();
const kind = z.enum(['INCOME', 'EXPENSE']);
const method = z.enum(['CASH', 'BANK', 'ONLINE']);

export const idParam = z.object({ id: uuid });
export const kindQuery = z.object({ kind: kind.optional() });

export const categoryBody = z.object({ kind, name: z.string().trim().min(2).max(60) });
export const categoryPatch = z.object({ name: z.string().trim().min(2).max(60).optional(), isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');

export const entryBody = z.object({
  kind, categoryId: uuid, amount: rupees, method, entryDate: day,
  description: z.string().trim().min(3).max(200), party: text(80), reference: text(80),
});

const range = z.object({ from: day.optional(), to: day.optional() });
const ordered = <T extends { from?: string; to?: string }>(v: T) => !v.from || !v.to || v.to >= v.from;
const orderedIssue = { path: ['to'], message: 'The end date must not be before the start date' };

export const entryQuery = range.extend({
  kind: kind.optional(), categoryId: uuid.optional(), method: method.optional(), q: z.string().trim().max(60).optional(), includeVoided: z.enum(['true', 'false']).optional(),
}).refine(ordered, orderedIssue);
export const summaryQuery = range.refine(ordered, orderedIssue);
export const monthlyQuery = z.object({ year: z.string().refine(validYear, 'Use a year such as 2026').optional() });
export const reasonBody = z.object({ reason: z.string().trim().min(3).max(200) });
