import { z } from 'zod';
import { MAX_BEDS } from './hostel.logic';

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().optional();
const fee = z.number().int().min(0).max(1_000_000);
const phone = z.string().trim().max(30).regex(/^[0-9+\-\s()]*$/, 'Digits, spaces, + and - only').transform((v) => (v === '' ? null : v)).nullable().optional();
const kind = z.enum(['BOYS', 'GIRLS', 'MIXED']);
const roomNo = z.string().trim().min(1).max(20);
const floor = z.number().int().min(-2).max(50).nullable().optional();

export const idParam = z.object({ id: uuid });
export const studentParam = z.object({ studentId: uuid });
export const includeInactiveQuery = z.object({ includeInactive: z.enum(['true', 'false']).optional() });
export const roomQuery = z.object({ hostelId: uuid.optional(), includeInactive: z.enum(['true', 'false']).optional() });
export const residentQuery = z.object({ hostelId: uuid.optional(), roomId: uuid.optional(), q: z.string().trim().max(60).optional() });

export const hostelBody = z.object({ name: z.string().trim().min(2).max(80), kind, wardenName: text(80), wardenPhone: phone, notes: text(300) });
export const hostelPatch = hostelBody.partial().extend({ active: z.boolean().optional() }).refine((v) => Object.keys(v).length > 0, 'Nothing to change');

export const roomBody = z.object({ hostelId: uuid, roomNo, floor, beds: z.number().int().min(1).max(MAX_BEDS), monthlyFee: fee.optional(), notes: text(300) });
export const roomPatch = z.object({ roomNo: roomNo.optional(), floor, beds: z.number().int().min(1).max(MAX_BEDS).optional(), monthlyFee: fee.optional(), notes: text(300), active: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export const assignBody = z.object({ roomId: uuid });
