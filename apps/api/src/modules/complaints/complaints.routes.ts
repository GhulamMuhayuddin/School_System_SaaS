import { Router, type Request } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { assignBody, complaintBody, complaintPatch, idParam, listQuery, noteBody, statusBody } from './complaints.schemas';
import type { ComplaintFilter, ComplaintsApi } from './complaints.types';

/** /api/complaints/*: complaint.read = view; logging, assigning, notes, status changes and edits need complaint.read AND complaint.manage. */
export function complaintsRouter(auth: AuthRuntime, complaints: ComplaintsApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const read = [...base, requirePermission(auth.permissions, 'complaint.read')];
  const manage = [...base, requirePermission(auth.permissions, 'complaint.read', 'complaint.manage')];
  const sid = (req: Request) => req.auth!.schoolId!;
  const uid = (req: Request) => req.auth!.userId;

  router.get('/summary', ...read, asyncHandler(async (req, res) => res.json(await complaints.summary(sid(req)))));
  router.get('/', ...read, validate({ query: listQuery }), asyncHandler(async (req, res) => {
    const q = req.query as Omit<ComplaintFilter, 'activeOnly'> & { active?: string };
    res.json(await complaints.list(sid(req), { status: q.status, category: q.category, priority: q.priority, assignedStaffId: q.assignedStaffId, q: q.q, activeOnly: q.active === 'true' }));
  }));
  router.post('/', ...manage, validate({ body: complaintBody }), asyncHandler(async (req, res) => res.status(201).json(await complaints.create(sid(req), uid(req), req.body))));
  router.get('/:id', ...read, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await complaints.get(sid(req), req.params.id))));
  router.patch('/:id', ...manage, validate({ params: idParam, body: complaintPatch }), asyncHandler(async (req, res) => res.json(await complaints.update(sid(req), uid(req), req.params.id, req.body))));
  router.post('/:id/assign', ...manage, validate({ params: idParam, body: assignBody }), asyncHandler(async (req, res) => res.json(await complaints.assign(sid(req), uid(req), req.params.id, req.body.staffId))));
  router.post('/:id/status', ...manage, validate({ params: idParam, body: statusBody }), asyncHandler(async (req, res) => res.json(await complaints.setStatus(sid(req), uid(req), req.params.id, req.body.status, req.body.resolution ?? null))));
  router.post('/:id/notes', ...manage, validate({ params: idParam, body: noteBody }), asyncHandler(async (req, res) => res.status(201).json(await complaints.addNote(sid(req), uid(req), req.params.id, req.body.text))));

  return router;
}
