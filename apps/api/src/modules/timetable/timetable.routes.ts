import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { assignBody, createPeriodBody, entryBody, idParam, listAssignmentsQuery, sectionParam, sessionQuery, updatePeriodBody } from './timetable.schemas';
import type { AssignmentFilter, TimetableApi } from './timetable.types';

/**
 * /api/timetable/*: periods, teacher assignments and the weekly timetable of the signed-in user's school
 * (school id from the token only). Reading needs academic.read (teachers can see their own and every class timetable);
 * editing lessons and periods needs academic.timetable.manage; assigning teachers needs academic.manage.
 */
export function timetableRouter(auth: AuthRuntime, timetable: TimetableApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const needs = (...keys: string[]) => [...base, requirePermission(auth.permissions, ...keys)];
  const sid = (req: { auth?: { schoolId: string | null } }) => req.auth!.schoolId!;
  const actor = (req: { auth?: { userId: string } }) => req.auth!.userId;

  router.get('/periods', ...needs('academic.read'), asyncHandler(async (req, res) => res.json({ periods: await timetable.listPeriods(sid(req)) })));
  router.post('/periods', ...needs('academic.timetable.manage'), validate({ body: createPeriodBody }),
    asyncHandler(async (req, res) => res.status(201).json({ period: await timetable.createPeriod(sid(req), req.body, actor(req)) })));
  router.patch('/periods/:id', ...needs('academic.timetable.manage'), validate({ params: idParam, body: updatePeriodBody }),
    asyncHandler(async (req, res) => res.json({ period: await timetable.updatePeriod(sid(req), req.params.id, req.body, actor(req)) })));
  router.delete('/periods/:id', ...needs('academic.timetable.manage'), validate({ params: idParam }),
    asyncHandler(async (req, res) => { await timetable.deletePeriod(sid(req), req.params.id, actor(req)); res.status(204).end(); }));

  router.get('/assignments', ...needs('academic.read'), validate({ query: listAssignmentsQuery }),
    asyncHandler(async (req, res) => res.json({ assignments: await timetable.listAssignments(sid(req), req.query as unknown as AssignmentFilter) })));
  router.post('/assignments', ...needs('academic.manage'), validate({ body: assignBody }),
    asyncHandler(async (req, res) => res.status(201).json({ assignment: await timetable.assign(sid(req), req.body, actor(req)) })));
  router.delete('/assignments/:id', ...needs('academic.manage'), validate({ params: idParam }),
    asyncHandler(async (req, res) => { await timetable.unassign(sid(req), req.params.id, actor(req)); res.status(204).end(); }));

  router.get('/sections/:id', ...needs('academic.read'), validate({ params: sectionParam, query: sessionQuery }),
    asyncHandler(async (req, res) => res.json(await timetable.sectionTimetable(sid(req), req.params.id, (req.query as { sessionId?: string }).sessionId))));
  router.get('/teachers', ...needs('academic.read'), asyncHandler(async (req, res) => res.json({ teachers: await timetable.listTeachers(sid(req)) })));
  router.get('/my', ...needs('academic.read'), validate({ query: sessionQuery }),
    asyncHandler(async (req, res) => res.json(await timetable.myTimetable(sid(req), actor(req), (req.query as { sessionId?: string }).sessionId))));
  router.get('/teachers/:id', ...needs('academic.read'), validate({ params: idParam, query: sessionQuery }),
    asyncHandler(async (req, res) => res.json(await timetable.teacherTimetable(sid(req), req.params.id, (req.query as { sessionId?: string }).sessionId))));

  router.put('/entries', ...needs('academic.timetable.manage'), validate({ body: entryBody }),
    asyncHandler(async (req, res) => res.json({ entry: await timetable.setEntry(sid(req), req.body, actor(req)) })));
  router.delete('/entries/:id', ...needs('academic.timetable.manage'), validate({ params: idParam }),
    asyncHandler(async (req, res) => { await timetable.deleteEntry(sid(req), req.params.id, actor(req)); res.status(204).end(); }));

  return router;
}
