import { z } from 'zod';
import { isRealDay } from '../../utils/dates';
import { validPeriod } from './fees.logic';

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((v) => isRealDay(v), 'Invalid date');
const rupees = z.number().int().min(0).max(100_000_000);
const text = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().optional();
const period = z.string().refine(validPeriod, 'Use YYYY-MM');

export const idParam = z.object({ id: uuid });
export const classParam = z.object({ classId: uuid });
export const studentParam = z.object({ studentId: uuid });
export const sessionQuery = z.object({ sessionId: uuid.optional() });

export const headBody = z.object({ name: z.string().trim().min(2).max(60) });
export const headPatch = z.object({ name: z.string().trim().min(2).max(60).optional(), isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');

export const structureBody = z.object({
  items: z.array(z.object({ feeHeadId: uuid, amount: rupees.refine((v) => v > 0, 'Amount must be above 0'), frequency: z.enum(['MONTHLY', 'ONE_TIME']) })).max(30),
});

export const concessionBody = z.object({ kind: z.enum(['PERCENT', 'FIXED']), value: rupees, reason: text(200) })
  .refine((v) => v.value > 0, { path: ['value'], message: 'Value must be above 0' })
  .refine((v) => v.kind !== 'PERCENT' || v.value <= 100, { path: ['value'], message: 'A percentage cannot be above 100' });

export const generateBody = z.object({
  classId: uuid, sectionId: uuid.optional(), period, dueDate: day, sessionId: uuid.optional(), includeOneTime: z.boolean().optional(), includeTransport: z.boolean().optional(), includeHostel: z.boolean().optional(),
});

export const voucherQuery = z.object({
  classId: uuid.optional(), sectionId: uuid.optional(), status: z.enum(['UNPAID', 'PARTIAL', 'PAID', 'CANCELLED']).optional(),
  period: period.optional(), studentId: uuid.optional(), q: z.string().trim().max(60).optional(), overdue: z.enum(['true', 'false']).optional(),
});

export const reasonBody = z.object({ reason: z.string().trim().min(3).max(200) });
export const payBody = z.object({
  amount: rupees.refine((v) => v > 0, 'Amount must be above 0'), method: z.enum(['CASH', 'BANK', 'ONLINE']),
  reference: text(80), paidAt: z.string().datetime().optional(),
});
export const summaryQuery = z.object({ from: day.optional(), to: day.optional() })
  .refine((v) => !v.from || !v.to || v.to >= v.from, { path: ['to'], message: 'The end date must not be before the start date' });
export const defaultersQuery = z.object({ classId: uuid.optional() });
