import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().optional();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), 'Invalid date');
const today = () => new Date().toISOString().slice(0, 10);
// Phone numbers are stored as typed (digits, +, spaces, dashes, brackets) so national formats keep working.
const phone = z.string().trim().min(6).max(25).regex(/^[0-9+\-()\s]+$/, 'Invalid phone number');
const relation = z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']);

export const idParam = z.object({ id: z.string().uuid() });
export const linkParams = z.object({ id: z.string().uuid(), linkId: z.string().uuid() });

export const guardianBody = z.object({
  guardianId: z.string().uuid().optional(),
  name: text(120),
  phone,
  email: z.union([z.string().trim().toLowerCase().email().max(254), z.literal('')]).transform((v) => v || null).nullable().optional(),
  occupation: optText(100),
  address: optText(300),
  relation,
  isPrimary: z.boolean().optional(),
});

export const createStudentBody = z.object({
  admissionNo: z.string().trim().min(1).max(30).optional(),
  firstName: text(80),
  lastName: text(80),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  dateOfBirth: day.refine((v) => v < today(), 'Date of birth must be in the past'),
  bloodGroup: optText(5),
  phone: z.union([phone, z.literal('')]).transform((v) => v || null).nullable().optional(),
  address: optText(300),
  previousSchool: optText(150),
  notes: optText(1000),
  classId: z.string().uuid(),
  sectionId: z.string().uuid().nullable().optional(),
  admissionDate: day,
  guardians: z.array(guardianBody).min(1, 'Add at least one guardian').max(5),
}).superRefine((v, ctx) => {
  if (v.guardians.filter((g) => g.isPrimary).length > 1) ctx.addIssue({ code: 'custom', path: ['guardians'], message: 'Only one primary guardian' });
});

export const updateStudentBody = z.object({
  firstName: text(80), lastName: text(80), gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  dateOfBirth: day.refine((v) => v < today(), 'Date of birth must be in the past'),
  bloodGroup: optText(5),
  phone: z.union([phone, z.literal('')]).transform((v) => v || null).nullable(),
  address: optText(300), previousSchool: optText(150), notes: optText(1000),
  classId: z.string().uuid(), sectionId: z.string().uuid().nullable(), admissionDate: day,
}).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const withdrawBody = z.object({ status: z.enum(['WITHDRAWN', 'TRANSFERRED', 'GRADUATED']), date: day, reason: optText(300) });

export const updateGuardianBody = z.object({
  name: text(120), phone, email: z.union([z.string().trim().toLowerCase().email().max(254), z.literal('')]).transform((v) => v || null).nullable(),
  occupation: optText(100), address: optText(300), relation, isPrimary: z.boolean(),
}).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const listStudentsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  classId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'WITHDRAWN', 'TRANSFERRED', 'GRADUATED']).optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});
