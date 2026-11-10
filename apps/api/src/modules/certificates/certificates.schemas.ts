import { z } from 'zod';
import { isRealDay } from '../../utils/dates';

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().optional();
const type = z.enum(['BONAFIDE', 'CHARACTER', 'LEAVING']);

export const idParam = z.object({ id: uuid });
export const listQuery = z.object({ type: type.optional(), status: z.enum(['VALID', 'VOID']).optional(), studentId: uuid.optional(), q: z.string().trim().max(60).optional() });
export const issueBody = z.object({ studentId: uuid, type, issuedOn: z.string().refine(isRealDay, 'Use a real date written YYYY-MM-DD').optional(), purpose: text(120), remarks: text(300) });
export const voidBody = z.object({ reason: z.string().trim().min(3).max(200) });
