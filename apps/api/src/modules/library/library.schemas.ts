import { z } from 'zod';

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().optional();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, 'Invalid date');

export const idParam = z.object({ id: uuid });

export const bookListQuery = z.object({
  q: z.string().trim().max(100).optional(), category: z.string().trim().max(60).optional(),
  available: z.enum(['true', 'false']).optional(), includeInactive: z.enum(['true', 'false']).optional(),
});
export const bookBody = z.object({
  title: z.string().trim().min(1).max(200), author: z.string().trim().min(1).max(150), isbn: text(30), category: text(60), publisher: text(120), language: text(40), location: text(60),
  copies: z.number().int().min(0).max(100).optional(),
});
export const bookPatch = z.object({
  title: z.string().trim().min(1).max(200).optional(), author: z.string().trim().min(1).max(150).optional(), isbn: text(30), category: text(60), publisher: text(120),
  language: text(40), location: text(60), active: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export const copiesBody = z.object({ count: z.number().int().min(1).max(100) });
export const copyStatusBody = z.object({ status: z.enum(['AVAILABLE', 'LOST', 'WITHDRAWN']) });

export const issueBody = z.object({
  copyId: uuid.optional(), accessionNo: z.string().trim().min(1).max(40).optional(), studentId: uuid, dueOn: day.optional(),
}).refine((v) => Boolean(v.copyId) !== Boolean(v.accessionNo), 'Give either copyId or accessionNo');
export const loanListQuery = z.object({ status: z.enum(['open', 'overdue', 'returned', 'all']).optional(), studentId: uuid.optional(), q: z.string().trim().max(100).optional() });
export const fineBody = z.object({ action: z.enum(['PAID', 'WAIVED']) });
export const settingsBody = z.object({
  loanDays: z.number().int().min(1).max(90), finePerDay: z.number().int().min(0).max(1000), maxBooksStudent: z.number().int().min(1).max(20),
});
