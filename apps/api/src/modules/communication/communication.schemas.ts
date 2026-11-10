import { z } from 'zod';
import { isRealDay } from '../../utils/dates';

const uuid = z.string().uuid();
export const idParam = z.object({ id: uuid });
export const inboxQuery = z.object({ unreadOnly: z.enum(['true', 'false']).optional() });
export const announcementBody = z.object({
  title: z.string().trim().min(3).max(120), body: z.string().trim().min(3).max(3000), audience: z.enum(['ALL', 'STAFF', 'PARENTS', 'STUDENTS', 'CLASS']),
  classId: uuid.nullable().optional(), priority: z.enum(['NORMAL', 'IMPORTANT']).optional(),
  expiresOn: z.string().refine(isRealDay, 'Use a real date written YYYY-MM-DD').nullable().optional(),
});
