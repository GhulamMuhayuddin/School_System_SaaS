import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { createEventBody, idParam, listEventsQuery, updateEventBody } from './calendar.schemas';
import type { CalendarApi, DateRange } from './calendar.types';

/** /api/calendar/events: reading needs academic.read (everyone on staff), changing needs academic.manage. School id from the token only. */
export function calendarRouter(auth: AuthRuntime, calendar: CalendarApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const needs = (...keys: string[]) => [...base, requirePermission(auth.permissions, ...keys)];
  const sid = (req: { auth?: { schoolId: string | null } }) => req.auth!.schoolId!;
  const actor = (req: { auth?: { userId: string } }) => req.auth!.userId;

  router.get('/events', ...needs('academic.read'), validate({ query: listEventsQuery }),
    asyncHandler(async (req, res) => res.json({ events: await calendar.list(sid(req), req.query as unknown as DateRange) })));
  router.post('/events', ...needs('academic.manage'), validate({ body: createEventBody }),
    asyncHandler(async (req, res) => res.status(201).json({ event: await calendar.create(sid(req), req.body, actor(req)) })));
  router.patch('/events/:id', ...needs('academic.manage'), validate({ params: idParam, body: updateEventBody }),
    asyncHandler(async (req, res) => res.json({ event: await calendar.update(sid(req), req.params.id, req.body, actor(req)) })));
  router.delete('/events/:id', ...needs('academic.manage'), validate({ params: idParam }),
    asyncHandler(async (req, res) => { await calendar.remove(sid(req), req.params.id, actor(req)); res.status(204).end(); }));

  return router;
}
