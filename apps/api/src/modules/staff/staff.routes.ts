import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { createStaffBody, idParam, leaveBody, listStaffQuery, updateStaffBody } from './staff.schemas';
import type { StaffApi, StaffCategory, StaffStatus } from './staff.types';

/** /api/staff/*: teachers and employees of the signed-in user's school (school id from the token only). */
export function staffRouter(auth: AuthRuntime, staff: StaffApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const needs = (...keys: string[]) => [...base, requirePermission(auth.permissions, ...keys)];
  const sid = (req: { auth?: { schoolId: string | null } }) => req.auth!.schoolId!;
  const actor = (req: { auth?: { userId: string } }) => req.auth!.userId;

  router.get('/', ...needs('staff.read'), validate({ query: listStaffQuery }),
    asyncHandler(async (req, res) => res.json(await staff.list(sid(req), req.query as unknown as { q?: string; category?: StaffCategory; status?: StaffStatus; limit: number }))));
  router.post('/', ...needs('staff.create'), validate({ body: createStaffBody }),
    asyncHandler(async (req, res) => res.status(201).json({ staff: await staff.create(sid(req), req.body, actor(req)) })));
  router.get('/:id', ...needs('staff.read'), validate({ params: idParam }), asyncHandler(async (req, res) => res.json({ staff: await staff.get(sid(req), req.params.id) })));
  router.patch('/:id', ...needs('staff.update'), validate({ params: idParam, body: updateStaffBody }),
    asyncHandler(async (req, res) => res.json({ staff: await staff.update(sid(req), req.params.id, req.body, actor(req)) })));
  router.post('/:id/leave', ...needs('staff.update'), validate({ params: idParam, body: leaveBody }),
    asyncHandler(async (req, res) => res.json({ staff: await staff.leave(sid(req), req.params.id, req.body, actor(req)) })));
  router.post('/:id/reinstate', ...needs('staff.update'), validate({ params: idParam }),
    asyncHandler(async (req, res) => res.json({ staff: await staff.reinstate(sid(req), req.params.id, actor(req)) })));
  router.delete('/:id', ...needs('staff.delete'), validate({ params: idParam }),
    asyncHandler(async (req, res) => { await staff.remove(sid(req), req.params.id, actor(req)); res.status(204).end(); }));

  return router;
}
