import { z } from 'zod';
import { isRealDay } from '../../utils/dates';

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().optional();
const phone = z.string().trim().max(30).regex(/^[0-9+\-\s()]*$/, 'Digits, spaces, + and - only').transform((v) => (v === '' ? null : v)).nullable().optional();

export const idParam = z.object({ id: uuid });
export const listQuery = z.object({ date: z.string().refine(isRealDay, 'Use a real date written YYYY-MM-DD').optional(), inside: z.enum(['true', 'false']).optional(), q: z.string().trim().max(60).optional() });
export const visitBody = z.object({ name: z.string().trim().min(2).max(80), phone, purpose: z.string().trim().min(2).max(120), visiting: text(80), studentId: uuid.nullable().optional(), notes: text(300) });
export const visitPatch = visitBody.partial().refine((v) => Object.keys(v).length > 0, 'Nothing to change');
