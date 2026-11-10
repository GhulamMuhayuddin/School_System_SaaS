import { z } from 'zod';

const uuid = z.string().uuid();
const description = z.string().trim().max(2000).transform((v) => (v === '' ? null : v)).nullable().optional();

export const idParam = z.object({ id: uuid });
export const listQuery = z.object({ classId: uuid, subjectId: uuid, sessionId: uuid.optional() });
export const summaryQuery = z.object({ classId: uuid, sessionId: uuid.optional() });
export const createTopicBody = z.object({ classId: uuid, subjectId: uuid, sessionId: uuid.optional(), title: z.string().trim().min(1).max(160), description });
export const updateTopicBody = z.object({ title: z.string().trim().min(1).max(160), description }).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export const statusBody = z.object({ status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED']) });
export const moveBody = z.object({ direction: z.enum(['up', 'down']) });
