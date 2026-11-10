import { Router, type Request } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { dateQuery, historyQuery, idParam, markStaffBody, markStudentsBody, monthQuery, reportQuery } from './attendance.schemas';
import type { AttendanceApi, Caller, ReportFilter } from './attendance.types';

/**
 * /api/attendance/*: student attendance (attendance.read / attendance.mark; past days and other teachers' sections need
 * attendance.correct) and staff attendance (staff.attendance). The school id and the caller come from the verified token only.
 */
export function attendanceRouter(auth: AuthRuntime, attendance: AttendanceApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const needs = (...keys: string[]) => [...base, requirePermission(auth.permissions, ...keys)];
  const sid = (req: Request) => req.auth!.schoolId!;
  const caller = async (req: Request): Promise<Caller> => ({ userId: req.auth!.userId, canCorrect: (await auth.permissions.get(req.auth!.roleId)).has('attendance.correct') });

  router.get('/students/sections/:id', ...needs('attendance.read'), validate({ params: idParam, query: dateQuery }),
    asyncHandler(async (req, res) => res.json(await attendance.sectionRoster(sid(req), req.params.id, (req.query as { date?: string }).date, await caller(req)))));
  router.put('/students/sections/:id', ...needs('attendance.mark'), validate({ params: idParam, body: markStudentsBody }),
    asyncHandler(async (req, res) => res.json(await attendance.markStudents(sid(req), req.params.id, req.body, await caller(req)))));
  router.get('/students/sections/:id/monthly', ...needs('attendance.read'), validate({ params: idParam, query: monthQuery }),
    asyncHandler(async (req, res) => res.json(await attendance.sectionMonthly(sid(req), req.params.id, (req.query as { month: string }).month))));
  router.get('/students/:id/history', ...needs('attendance.read'), validate({ params: idParam, query: historyQuery }),
    asyncHandler(async (req, res) => { const q = req.query as { from: string; to: string }; res.json(await attendance.studentHistory(sid(req), req.params.id, q.from, q.to)); }));
  router.get('/reports/students', ...needs('attendance.read'), validate({ query: reportQuery }),
    asyncHandler(async (req, res) => res.json(await attendance.studentReport(sid(req), req.query as unknown as ReportFilter))));

  router.get('/staff', ...needs('staff.attendance'), validate({ query: dateQuery }),
    asyncHandler(async (req, res) => res.json(await attendance.staffRoster(sid(req), (req.query as { date?: string }).date))));
  router.put('/staff', ...needs('staff.attendance'), validate({ body: markStaffBody }),
    asyncHandler(async (req, res) => res.json(await attendance.markStaff(sid(req), req.body, await caller(req)))));
  router.get('/staff/monthly', ...needs('staff.attendance'), validate({ query: monthQuery }),
    asyncHandler(async (req, res) => res.json(await attendance.staffMonthly(sid(req), (req.query as { month: string }).month))));

  return router;
}
