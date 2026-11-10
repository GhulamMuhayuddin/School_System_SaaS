import { Router, type Request } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { idParam, listQuery, visitBody, visitPatch } from './visitors.schemas';
import type { VisitorsApi } from './visitors.types';

/** /api/visitors/*: the gate log. visitor.read = view; checking in / out and editing needs visitor.read AND visitor.manage. */
export function visitorsRouter(auth: AuthRuntime, visitors: VisitorsApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const read = [...base, requirePermission(auth.permissions, 'visitor.read')];
  const manage = [...base, requirePermission(auth.permissions, 'visitor.read', 'visitor.manage')];
  const sid = (req: Request) => req.auth!.schoolId!;
  const uid = (req: Request) => req.auth!.userId;

  router.get('/summary', ...read, asyncHandler(async (req, res) => res.json(await visitors.summary(sid(req)))));
  router.get('/visits', ...read, validate({ query: listQuery }), asyncHandler(async (req, res) => {
    const q = req.query as { date?: string; inside?: string; q?: string };
    res.json(await visitors.list(sid(req), { date: q.date, insideOnly: q.inside === 'true', q: q.q }));
  }));
  router.post('/visits', ...manage, validate({ body: visitBody }), asyncHandler(async (req, res) => res.status(201).json(await visitors.checkIn(sid(req), uid(req), req.body))));
  router.post('/visits/:id/checkout', ...manage, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await visitors.checkOut(sid(req), uid(req), req.params.id))));
  router.patch('/visits/:id', ...manage, validate({ params: idParam, body: visitPatch }), asyncHandler(async (req, res) => res.json(await visitors.update(sid(req), uid(req), req.params.id, req.body))));

  return router;
}
