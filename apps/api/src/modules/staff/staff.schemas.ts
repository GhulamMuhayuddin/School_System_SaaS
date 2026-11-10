import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().optional();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), 'Invalid date');
const today = () => new Date().toISOString().slice(0, 10);
const phone = z.string().trim().min(6).max(25).regex(/^[0-9+\-()\s]+$/, 'Invalid phone number');
const email = z.union([z.string().trim().toLowerCase().email().max(254), z.literal('')]).transform((v) => v || null).nullable().optional();
const cnic = z.union([z.string().trim().regex(/^[0-9-]{13,15}$/, 'Invalid CNIC'), z.literal('')]).transform((v) => v || null).nullable().optional();
const category = z.enum(['TEACHING', 'ADMINISTRATIVE', 'SUPPORT']);

export const idParam = z.object({ id: z.string().uuid() });

export const createStaffBody = z.object({
  employeeNo: z.string().trim().min(1).max(30).optional(),
  firstName: text(80), lastName: text(80), gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  dateOfBirth: day.refine((v) => v < today(), 'Date of birth must be in the past').nullable().optional(),
  phone, email, cnic, address: optText(300), category, designation: text(100), qualification: optText(150),
  joiningDate: day, notes: optText(1000),
});

export const updateStaffBody = z.object({
  firstName: text(80), lastName: text(80), gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  dateOfBirth: day.refine((v) => v < today(), 'Date of birth must be in the past').nullable(),
  phone, email, cnic, address: optText(300), category, designation: text(100), qualification: optText(150),
  joiningDate: day, notes: optText(1000),
}).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const leaveBody = z.object({ date: day, reason: optText(300) });

export const listStaffQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: category.optional(),
  status: z.enum(['ACTIVE', 'LEFT']).optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});
