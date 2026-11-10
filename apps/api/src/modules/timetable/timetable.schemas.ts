import { z } from 'zod';

const uuid = z.string().uuid();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time like 08:30');

export const idParam = z.object({ id: uuid });
export const sectionParam = z.object({ id: uuid });
export const sessionQuery = z.object({ sessionId: uuid.optional() });

export const createPeriodBody = z
  .object({ name: z.string().trim().min(1).max(40), startTime: time, endTime: time, isBreak: z.boolean().optional() })
  .refine((v) => v.endTime > v.startTime, { path: ['endTime'], message: 'End time must be after the start time' });
export const updatePeriodBody = z
  .object({ name: z.string().trim().min(1).max(40), startTime: time, endTime: time, isBreak: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const assignBody = z.object({ sessionId: uuid.optional(), sectionId: uuid, subjectId: uuid, staffId: uuid });
export const listAssignmentsQuery = z.object({ sessionId: uuid.optional(), staffId: uuid.optional(), sectionId: uuid.optional() });

export const entryBody = z.object({
  sessionId: uuid.optional(),
  sectionId: uuid,
  dayOfWeek: z.number().int().min(1).max(7),
  periodId: uuid,
  subjectId: uuid,
  room: z.string().trim().max(30).transform((v) => (v === '' ? null : v)).nullable().optional(),
});
