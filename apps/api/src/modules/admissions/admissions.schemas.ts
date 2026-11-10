import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().optional();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), 'Invalid date');
const today = () => new Date().toISOString().slice(0, 10);
const phone = z.string().trim().min(6).max(25).regex(/^[0-9+\-()\s]+$/, 'Invalid phone number');

export const idParam = z.object({ id: z.string().uuid() });

const fields = {
  firstName: text(80), lastName: text(80), gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  dateOfBirth: day.refine((v) => v < today(), 'Date of birth must be in the past'),
  bloodGroup: optText(5), previousSchool: optText(150), address: optText(300), notes: optText(1000),
  appliedClassId: z.string().uuid(), guardianName: text(120), guardianPhone: phone,
  guardianEmail: z.union([z.string().trim().toLowerCase().email().max(254), z.literal('')]).transform((v) => v || null).nullable().optional(),
  guardianRelation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']), guardianOccupation: optText(100), applicationDate: day,
};
export const createApplicationBody = z.object({ ...fields, applicationDate: fields.applicationDate.default(today()) });
export const updateApplicationBody = z.object(fields).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export const approveBody = z.object({
  classId: z.string().uuid().optional(), sectionId: z.string().uuid().nullable().optional(), admissionDate: day,
  admissionNo: z.string().trim().min(1).max(30).optional(),
});
export const rejectBody = z.object({ note: optText(300) });
export const listQuery = z.object({
  q: z.string().trim().max(100).optional(), status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  classId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(2000).default(500),
});
