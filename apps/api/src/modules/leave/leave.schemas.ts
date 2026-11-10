import { z } from 'zod';
import { isRealDay } from '../../utils/dates';

const uuid = z.string().uuid();
const day = z.string().refine(isRealDay, 'Use a real date written YYYY-MM-DD');
const note = z.string().trim().max(300).transform((v) => (v === '' ? null : v)).nullable().optional();
const quota = z.number().int().min(1).max(366).nullable().optional();

export const idParam = z.object({ id: uuid });
export const typeQuery = z.object({ includeInactive: z.enum(['true', 'false']).optional() });
export const typeBody = z.object({ name: z.string().trim().min(2).max(60), yearlyQuota: quota, paid: z.boolean().optional() });
export const typePatch = typeBody.partial().extend({ active: z.boolean().optional() }).refine((v) => Object.keys(v).length > 0, 'Nothing to change');

export const listQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(), staffId: uuid.optional(), from: day.optional(), to: day.optional(),
  mine: z.enum(['true', 'false']).optional(),
});
export const applyBody = z.object({ leaveTypeId: uuid, fromDate: day, toDate: day, reason: note, staffId: uuid.optional() });
export const decisionBody = z.object({ note });
export const balanceQuery = z.object({ staffId: uuid.optional(), year: z.coerce.number().int().min(2000).max(2100).optional() });
