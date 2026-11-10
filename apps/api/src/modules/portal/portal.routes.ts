import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { monthQuery } from '../attendance/attendance.schemas';
import { listEventsQuery } from '../calendar/calendar.schemas';
import { childParam, rangeQuery } from '../homework/homework.schemas';
import { voucherParam } from './portal.schemas';
import type { PortalApi } from './portal.service';

/** /api/portal/*: for parent and student accounts (permission portal.own.read). Always limited to the caller's own linked children. */
export function portalRouter(auth: AuthRuntime, portal: PortalApi): Router {
  const router = Router();
  const guard = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool, requirePermission(auth.permissions, 'portal.own.read')];
  router.get('/children', ...guard, asyncHandler(async (req, res) => res.json(await portal.children(req.auth!.schoolId!, req.auth!.userId))));
  router.get('/children/:studentId/homework', ...guard, validate({ params: childParam, query: rangeQuery }),
    asyncHandler(async (req, res) => { const q = req.query as { from?: string; to?: string }; res.json(await portal.childHomework(req.auth!.schoolId!, req.auth!.userId, req.params.studentId, q)); }));
  const own = (req: { auth?: { schoolId?: string | null; userId: string }; params: Record<string, string> }) => [req.auth!.schoolId!, req.auth!.userId, req.params.studentId] as const;
  router.get('/children/:studentId/attendance', ...guard, validate({ params: childParam, query: monthQuery }),
    asyncHandler(async (req, res) => res.json(await portal.childAttendance(...own(req), (req.query as { month: string }).month))));
  router.get('/children/:studentId/results', ...guard, validate({ params: childParam }), asyncHandler(async (req, res) => res.json(await portal.childResults(...own(req)))));
  router.get('/children/:studentId/fees', ...guard, validate({ params: childParam }), asyncHandler(async (req, res) => res.json(await portal.childFees(...own(req)))));
  router.get('/children/:studentId/fees/:voucherId', ...guard, validate({ params: voucherParam }),
    asyncHandler(async (req, res) => res.json(await portal.childVoucher(...own(req), req.params.voucherId))));
  router.get('/children/:studentId/timetable', ...guard, validate({ params: childParam }), asyncHandler(async (req, res) => res.json({ timetable: await portal.childTimetable(...own(req)) })));
  router.get('/children/:studentId/library', ...guard, validate({ params: childParam }), asyncHandler(async (req, res) => res.json(await portal.childLibrary(...own(req)))));
  router.get('/children/:studentId/transport', ...guard, validate({ params: childParam }), asyncHandler(async (req, res) => res.json(await portal.childTransport(...own(req)))));
  router.get('/children/:studentId/hostel', ...guard, validate({ params: childParam }), asyncHandler(async (req, res) => res.json(await portal.childHostel(...own(req)))));
  router.get('/calendar', ...guard, validate({ query: listEventsQuery }), asyncHandler(async (req, res) => res.json({ events: await portal.calendar(req.auth!.schoolId!, req.query as unknown as { from: string; to: string }) })));
  return router;
}
