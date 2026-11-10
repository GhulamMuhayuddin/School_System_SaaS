import { z } from 'zod';
import { isRealDay } from '../../utils/dates';

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((v) => isRealDay(v), 'Invalid date');
const maybeDay = day.nullable().optional();
const name = z.string().trim().min(2).max(100);
const twoDecimals = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100 === v;
const remark = z.string().trim().max(200).transform((v) => (v === '' ? null : v)).nullable().optional();

export const idParam = z.object({ id: uuid });
export const paperParam = z.object({ paperId: uuid });
export const classParam = z.object({ id: uuid, classId: uuid });
export const studentParam = z.object({ id: uuid, studentId: uuid });
export const listQuery = z.object({ sessionId: uuid.optional() });
export const resultsQuery = z.object({ classId: uuid, sectionId: uuid.optional() });

const dateOrder = (v: { startDate?: string | null; endDate?: string | null }) => !v.startDate || !v.endDate || v.endDate >= v.startDate;
const dateOrderMsg = { path: ['endDate'], message: 'The end date must not be before the start date' };

export const createExamBody = z.object({ name, sessionId: uuid.optional(), startDate: maybeDay, endDate: maybeDay }).refine(dateOrder, dateOrderMsg);
export const updateExamBody = z.object({ name: name.optional(), startDate: maybeDay, endDate: maybeDay })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change')
  .refine(dateOrder, dateOrderMsg);

const marksNumber = z.number().min(0).max(100000).refine(twoDecimals, 'Use at most 2 decimals');
export const papersBody = z.object({
  papers: z.array(z.object({
    subjectId: uuid, totalMarks: marksNumber.refine((v) => v > 0, 'Total marks must be above 0'), passMarks: marksNumber, examDate: maybeDay,
  }).refine((p) => p.passMarks <= p.totalMarks, { path: ['passMarks'], message: 'Pass marks cannot be above the total marks' })).max(40),
});

export const marksBody = z.object({
  entries: z.array(z.object({ studentId: uuid, marks: marksNumber.nullable().optional(), absent: z.boolean().optional(), remark })
    .refine((e) => !(e.absent && e.marks !== null && e.marks !== undefined), { path: ['marks'], message: 'An absent student cannot have marks' })).min(1).max(300),
});

export const publishBody = z.object({ force: z.boolean().optional() });

export const bandsBody = z.object({
  bands: z.array(z.object({
    grade: z.string().trim().min(1).max(10), minPercent: z.number().int().min(0).max(100), remark: z.string().trim().max(60).transform((v) => (v === '' ? null : v)).nullable().optional().transform((v) => v ?? null),
  })).min(1).max(15),
});
