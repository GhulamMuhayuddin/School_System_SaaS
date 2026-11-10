import { z } from 'zod';
import { isRealDay } from '../../utils/dates';

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((v) => isRealDay(v), 'Invalid date');
const status = z.enum(['PRESENT', 'ABSENT', 'LATE', 'LEAVE']);
const remark = z.string().trim().max(200).transform((v) => (v === '' ? null : v)).nullable().optional();
const MAX_RANGE_DAYS = 366;
const span = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

export const idParam = z.object({ id: uuid });
export const dateQuery = z.object({ date: day.optional() });
export const monthQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM') });

const rangeRules = <T extends z.ZodType<{ from: string; to: string }>>(schema: T) =>
  schema
    .refine((v) => v.to >= v.from, { path: ['to'], message: 'The end of the range must not be before its start' })
    .refine((v) => span(v.from, v.to) <= MAX_RANGE_DAYS, { path: ['to'], message: `Ask for at most ${MAX_RANGE_DAYS} days at a time` });

export const historyQuery = rangeRules(z.object({ from: day, to: day }));
export const reportQuery = rangeRules(
  z.object({
    from: day, to: day, classId: uuid.optional(), sectionId: uuid.optional(),
    below: z.coerce.number().int().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(200),
  }),
);

export const markStudentsBody = z.object({
  date: day,
  entries: z.array(z.object({ studentId: uuid, status, remark })).min(1).max(200),
});
export const markStaffBody = z.object({
  date: day,
  entries: z.array(z.object({ staffId: uuid, status, remark })).min(1).max(500),
});
