import { Router, type Request } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { createBody, idParam, listQuery, submissionsBody, updateBody } from './homework.schemas';
import type { Caller, HomeworkApi, HomeworkFilter } from './homework.types';

/**
 * /api/homework/*: homework per section and subject, and who handed it in.
 * Staff view: homework.read AND academic.read (parents also hold homework.read, so they must NOT reach these routes; they use /api/portal).
 * Writes: homework.manage. A teacher only changes homework of the sections and subjects they teach; academic.manage may change any.
 * The school id and the caller come from the verified token only.
 */
export function homeworkRouter(auth: AuthRuntime, homework: HomeworkApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const needs = (...keys: string[]) => [...base, requirePermission(auth.permissions, ...keys)];
  const view = needs('homework.read', 'academic.read');
  const write = needs('homework.read', 'academic.read', 'homework.manage');
  const sid = (req: Request) => req.auth!.schoolId!;
  const caller = async (req: Request): Promise<Caller> => ({ userId: req.auth!.userId, canManage: (await auth.permissions.get(req.auth!.roleId)).has('academic.manage') });

  router.get('/', ...view, validate({ query: listQuery }),
    asyncHandler(async (req, res) => { const q = req.query as Record<string, string | undefined>; res.json(await homework.list(sid(req), { ...q, mine: q.mine === 'true' } as HomeworkFilter, await caller(req))); }));
  router.post('/', ...write, validate({ body: createBody }), asyncHandler(async (req, res) => res.status(201).json(await homework.create(sid(req), await caller(req), req.body))));
  router.get('/:id', ...view, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await homework.get(sid(req), req.params.id, await caller(req)))));
  router.patch('/:id', ...write, validate({ params: idParam, body: updateBody }), asyncHandler(async (req, res) => res.json(await homework.update(sid(req), await caller(req), req.params.id, req.body))));
  router.delete('/:id', ...write, validate({ params: idParam }), asyncHandler(async (req, res) => { await homework.remove(sid(req), await caller(req), req.params.id); res.status(204).end(); }));
  router.put('/:id/submissions', ...write, validate({ params: idParam, body: submissionsBody }),
    asyncHandler(async (req, res) => res.json(await homework.saveSubmissions(sid(req), await caller(req), req.params.id, req.body.entries))));

  return router;
}
