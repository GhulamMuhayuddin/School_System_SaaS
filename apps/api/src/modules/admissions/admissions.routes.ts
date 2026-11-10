import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { approveBody, createApplicationBody, idParam, listQuery, rejectBody, updateApplicationBody } from './admissions.schemas';
import type { AdmissionStatus, AdmissionsApi } from './admissions.types';

/** /api/admissions/*: admission applications of the signed-in user's school (school id from the token only). */
export function admissionsRouter(auth: AuthRuntime, admissions: AdmissionsApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const needs = (...keys: string[]) => [...base, requirePermission(auth.permissions, ...keys)];
  const sid = (req: { auth?: { schoolId: string | null } }) => req.auth!.schoolId!;
  const actor = (req: { auth?: { userId: string } }) => req.auth!.userId;

  router.get('/', ...needs('admission.read'), validate({ query: listQuery }),
    asyncHandler(async (req, res) => res.json(await admissions.list(sid(req), req.query as unknown as { q?: string; status?: AdmissionStatus; classId?: string; limit: number }))));
  router.post('/', ...needs('admission.create'), validate({ body: createApplicationBody }),
    asyncHandler(async (req, res) => res.status(201).json({ application: await admissions.create(sid(req), req.body, actor(req)) })));
  router.get('/:id', ...needs('admission.read'), validate({ params: idParam }), asyncHandler(async (req, res) => res.json({ application: await admissions.get(sid(req), req.params.id) })));
  router.patch('/:id', ...needs('admission.update'), validate({ params: idParam, body: updateApplicationBody }),
    asyncHandler(async (req, res) => res.json({ application: await admissions.update(sid(req), req.params.id, req.body, actor(req)) })));
  // Approving enrols a student, so it needs admission.approve (the approver does not need student.create).
  router.post('/:id/approve', ...needs('admission.approve'), validate({ params: idParam, body: approveBody }),
    asyncHandler(async (req, res) => res.json(await admissions.approve(sid(req), req.params.id, req.body, actor(req)))));
  router.post('/:id/reject', ...needs('admission.approve'), validate({ params: idParam, body: rejectBody }),
    asyncHandler(async (req, res) => res.json({ application: await admissions.reject(sid(req), req.params.id, req.body.note ?? null, actor(req)) })));

  return router;
}
