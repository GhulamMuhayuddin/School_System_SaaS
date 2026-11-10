import { z } from 'zod';
import { isRealDay } from '../../utils/dates';

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((v) => isRealDay(v), 'Invalid date');
const iso = (d: Date) => d.toISOString().slice(0, 10);
const eventType = z.enum(['HOLIDAY', 'EVENT', 'EXAM', 'OTHER']);
const description = z.string().trim().max(1000).transform((v) => (v === '' ? null : v)).nullable().optional();
const MAX_RANGE_DAYS = 400;

export const idParam = z.object({ id: uuid });

/** Defaults to the current month. The range is capped so one request cannot pull years of data. */
export const listEventsQuery = z
  .object({ from: day.optional(), to: day.optional() })
  .transform((v) => {
    const now = new Date();
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    return { from: v.from ?? iso(first), to: v.to ?? iso(last) };
  })
  .refine((v) => v.to >= v.from, { path: ['to'], message: 'The end of the range must not be before its start' })
  .refine((v) => (Date.parse(`${v.to}T00:00:00Z`) - Date.parse(`${v.from}T00:00:00Z`)) / 86_400_000 <= MAX_RANGE_DAYS, { path: ['to'], message: `Ask for at most ${MAX_RANGE_DAYS} days at a time` });

export const createEventBody = z
  .object({ title: z.string().trim().min(1).max(120), type: eventType, startDate: day, endDate: day.optional(), description })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { path: ['endDate'], message: 'The end date must not be before the start date' });

export const updateEventBody = z
  .object({ title: z.string().trim().min(1).max(120), type: eventType, startDate: day, endDate: day, description })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
