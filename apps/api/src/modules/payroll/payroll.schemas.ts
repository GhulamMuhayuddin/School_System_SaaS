import { z } from 'zod';
import { isRealDay } from '../../utils/dates';
import { MAX_AMOUNT } from './payroll.logic';

const uuid = z.string().uuid();
const money = z.number().int().min(0).max(MAX_AMOUNT);
const note = z.string().trim().max(300).transform((v) => (v === '' ? null : v)).nullable().optional();

export const idParam = z.object({ id: uuid });
export const staffParam = z.object({ staffId: uuid });
export const salaryQuery = z.object({ q: z.string().trim().max(60).optional(), missing: z.enum(['true', 'false']).optional() });
export const salaryBody = z.object({ basic: money.refine((v) => v >= 1, 'Basic salary must be at least 1'), allowances: money.optional(), fixedDeduction: money.optional(), notes: note });
export const runBody = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM') });
export const slipPatch = z.object({ bonus: money.optional(), otherDeduction: money.optional(), note })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export const payBody = z.object({ method: z.enum(['CASH', 'BANK', 'ONLINE']), paidOn: z.string().refine(isRealDay, 'Use a real date written YYYY-MM-DD').optional() });
export const voidBody = z.object({ reason: z.string().trim().min(3).max(200) });
