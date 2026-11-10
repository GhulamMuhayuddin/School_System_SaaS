import { z } from 'zod';
import { isRealDay } from '../../utils/dates';

const name = z.string().trim().min(1).max(60);
export const idParam = z.object({ id: z.string().uuid() });
export const createClassBody = z.object({ name, level: z.number().int().min(0).max(100).default(0) });
export const updateClassBody = z.object({ name, level: z.number().int().min(0).max(100) }).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export const createSectionBody = z.object({ name, capacity: z.number().int().positive().max(500).nullable().optional() });
export const updateSectionBody = z.object({ name, capacity: z.number().int().positive().max(500).nullable() }).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((v) => isRealDay(v), 'Invalid date');
const optionalCode = z.string().trim().max(20).transform((v) => (v === '' ? null : v)).nullable().optional();

export const createSessionBody = z
  .object({ name: z.string().trim().min(1).max(40), startDate: day, endDate: day, isCurrent: z.boolean().optional() })
  .refine((v) => v.endDate > v.startDate, { path: ['endDate'], message: 'End date must be after the start date' });
export const updateSessionBody = z
  .object({ name: z.string().trim().min(1).max(40), startDate: day, endDate: day })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const createSubjectBody = z.object({ name: z.string().trim().min(1).max(80), code: optionalCode });
export const updateSubjectBody = z.object({ name: z.string().trim().min(1).max(80), code: optionalCode }).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export const setClassSubjectsBody = z.object({ subjectIds: z.array(z.string().uuid()).max(80) });
