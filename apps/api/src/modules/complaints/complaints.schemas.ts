import { z } from 'zod';

const uuid = z.string().uuid();
const phone = z.string().trim().max(30).regex(/^[0-9+\-\s()]*$/, 'Digits, spaces, + and - only').transform((v) => (v === '' ? null : v)).nullable().optional();
const source = z.enum(['PARENT', 'STUDENT', 'STAFF', 'OTHER']);
const category = z.enum(['ACADEMIC', 'DISCIPLINE', 'FEES', 'TRANSPORT', 'FACILITIES', 'STAFF', 'OTHER']);
const priority = z.enum(['LOW', 'NORMAL', 'HIGH']);
const status = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);

export const idParam = z.object({ id: uuid });
export const listQuery = z.object({
  status: status.optional(), category: category.optional(), priority: priority.optional(), assignedStaffId: uuid.optional(), q: z.string().trim().max(60).optional(), active: z.enum(['true', 'false']).optional(),
});
export const complaintBody = z.object({
  source, name: z.string().trim().min(2).max(80), phone, studentId: uuid.nullable().optional(), category, subject: z.string().trim().min(3).max(120), details: z.string().trim().min(3).max(2000), priority: priority.optional(),
});
export const complaintPatch = complaintBody.omit({ source: true }).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export const assignBody = z.object({ staffId: uuid.nullable() });
export const statusBody = z.object({ status, resolution: z.string().trim().max(1000).transform((v) => (v === '' ? null : v)).nullable().optional() });
export const noteBody = z.object({ text: z.string().trim().min(1).max(1000) });
