import { z } from 'zod';
import { isRealDay } from '../../utils/dates';

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((v) => isRealDay(v), 'Invalid date');
const text = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().optional();
const maxMarks = z.number().int().min(1).max(1000).nullable().optional();
const status = z.enum(['SUBMITTED', 'LATE', 'MISSING']);

export const idParam = z.object({ id: uuid });
export const childParam = z.object({ studentId: uuid });

const ordered = (v: { from?: string; to?: string }) => !v.from || !v.to || v.to >= v.from;
const orderedIssue = { path: ['to'], message: 'The end date must not be before the start date' };
export const listQuery = z.object({
  classId: uuid.optional(), sectionId: uuid.optional(), subjectId: uuid.optional(), from: day.optional(), to: day.optional(), mine: z.enum(['true', 'false']).optional(),
}).refine(ordered, orderedIssue);
export const rangeQuery = z.object({ from: day.optional(), to: day.optional() }).refine(ordered, orderedIssue);

export const createBody = z.object({
  sectionId: uuid, subjectId: uuid, title: z.string().trim().min(3).max(120), description: text(2000), assignedDate: day.optional(), dueDate: day, maxMarks,
});
export const updateBody = z.object({ title: z.string().trim().min(3).max(120).optional(), description: text(2000), dueDate: day.optional(), maxMarks })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');

export const submissionsBody = z.object({
  entries: z.array(z.object({ studentId: uuid, status: status.nullable(), marks: z.number().int().min(0).max(1000).nullable().optional(), remark: text(200) })).min(1).max(300),
});
