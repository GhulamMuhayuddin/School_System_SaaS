import { Router, type Request } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requireAnyPermission, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { applyBody, balanceQuery, decisionBody, idParam, listQuery, typeBody, typePatch, typeQuery } from './leave.schemas';
import type { LeaveActor, LeaveApi, LeaveFilter } from './leave.types';

/**
 * /api/leave/*: leave types, requests and yearly balances.
 *  leave.apply = apply for yourself, see your own requests and balances (teachers).
 *  leave.read = see everybody's requests. leave.approve = decide requests and apply on behalf of someone.
 *  Changing leave types needs leave.read AND staff.update (HR and school admin). School id and caller come from the verified token only.
 */
export function leaveRouter(auth: AuthRuntime, leave: LeaveApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const anyLeave = [...base, requireAnyPermission(auth.permissions, 'leave.apply', 'leave.read', 'leave.approve')];
  const applier = [...base, requireAnyPermission(auth.permissions, 'leave.apply', 'leave.approve')];
  const approver = [...base, requirePermission(auth.permissions, 'leave.approve')];
  const typeAdmin = [...base, requirePermission(auth.permissions, 'leave.read', 'staff.update')];
  const sid = (req: Request) => req.auth!.schoolId!;
  const actor = async (req: Request): Promise<LeaveActor> => {
    const granted = await auth.permissions.get(req.auth!.roleId);
    return { userId: req.auth!.userId, canApprove: granted.has('leave.approve'), canSeeAll: granted.has('leave.read') || granted.has('leave.approve') };
  };

  router.get('/types', ...anyLeave, validate({ query: typeQuery }), asyncHandler(async (req, res) =>
    res.json(await leave.listTypes(sid(req), (req.query as { includeInactive?: string }).includeInactive === 'true'))));
  router.post('/types', ...typeAdmin, validate({ body: typeBody }), asyncHandler(async (req, res) => res.status(201).json(await leave.createType(sid(req), req.auth!.userId, req.body))));
  router.post('/types/defaults', ...typeAdmin, asyncHandler(async (req, res) => res.json(await leave.addDefaultTypes(sid(req), req.auth!.userId))));
  router.patch('/types/:id', ...typeAdmin, validate({ params: idParam, body: typePatch }), asyncHandler(async (req, res) => res.json(await leave.updateType(sid(req), req.auth!.userId, req.params.id, req.body))));

  router.get('/requests', ...anyLeave, validate({ query: listQuery }), asyncHandler(async (req, res) => {
    const q = req.query as LeaveFilter & { mine?: string };
    res.json(await leave.list(sid(req), await actor(req), { status: q.status, staffId: q.staffId, from: q.from, to: q.to, mine: q.mine === 'true' }));
  }));
  router.post('/requests', ...applier, validate({ body: applyBody }), asyncHandler(async (req, res) => res.status(201).json(await leave.apply(sid(req), await actor(req), req.body))));
  router.post('/requests/:id/approve', ...approver, validate({ params: idParam, body: decisionBody }), asyncHandler(async (req, res) =>
    res.json(await leave.approve(sid(req), await actor(req), req.params.id, req.body.note ?? null))));
  router.post('/requests/:id/reject', ...approver, validate({ params: idParam, body: decisionBody }), asyncHandler(async (req, res) =>
    res.json(await leave.reject(sid(req), await actor(req), req.params.id, req.body.note ?? null))));
  router.post('/requests/:id/cancel', ...applier, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await leave.cancel(sid(req), await actor(req), req.params.id))));

  router.get('/balances', ...anyLeave, validate({ query: balanceQuery }), asyncHandler(async (req, res) => {
    const q = req.query as unknown as { staffId?: string; year?: number };
    res.json(await leave.balances(sid(req), await actor(req), q.staffId, q.year ?? new Date().getUTCFullYear()));
  }));

  return router;
}
