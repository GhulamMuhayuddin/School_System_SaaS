import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { createTopicBody, idParam, listQuery, moveBody, statusBody, summaryQuery, updateTopicBody } from './syllabus.schemas';
import type { SyllabusApi, SyllabusFilter } from './syllabus.types';

/** /api/syllabus/*: reading needs academic.read, every change needs academic.manage. School id from the token only. */
export function syllabusRouter(auth: AuthRuntime, syllabus: SyllabusApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const needs = (...keys: string[]) => [...base, requirePermission(auth.permissions, ...keys)];
  const sid = (req: { auth?: { schoolId: string | null } }) => req.auth!.schoolId!;
  const actor = (req: { auth?: { userId: string } }) => req.auth!.userId;

  router.get('/topics', ...needs('academic.read'), validate({ query: listQuery }),
    asyncHandler(async (req, res) => res.json(await syllabus.list(sid(req), req.query as unknown as SyllabusFilter))));
  router.get('/summary', ...needs('academic.read'), validate({ query: summaryQuery }),
    asyncHandler(async (req, res) => { const q = req.query as { classId: string; sessionId?: string }; res.json(await syllabus.summary(sid(req), q.classId, q.sessionId)); }));
  router.post('/topics', ...needs('academic.manage'), validate({ body: createTopicBody }),
    asyncHandler(async (req, res) => res.status(201).json({ topic: await syllabus.create(sid(req), req.body, actor(req)) })));
  router.patch('/topics/:id', ...needs('academic.manage'), validate({ params: idParam, body: updateTopicBody }),
    asyncHandler(async (req, res) => res.json({ topic: await syllabus.update(sid(req), req.params.id, req.body, actor(req)) })));
  router.post('/topics/:id/status', ...needs('academic.manage'), validate({ params: idParam, body: statusBody }),
    asyncHandler(async (req, res) => res.json({ topic: await syllabus.setStatus(sid(req), req.params.id, req.body.status, actor(req)) })));
  router.post('/topics/:id/move', ...needs('academic.manage'), validate({ params: idParam, body: moveBody }),
    asyncHandler(async (req, res) => res.json({ topics: await syllabus.move(sid(req), req.params.id, req.body.direction, actor(req)) })));
  router.delete('/topics/:id', ...needs('academic.manage'), validate({ params: idParam }),
    asyncHandler(async (req, res) => { await syllabus.remove(sid(req), req.params.id, actor(req)); res.status(204).end(); }));

  return router;
}
