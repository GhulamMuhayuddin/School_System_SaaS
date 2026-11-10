import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { createStudentBody, guardianBody, idParam, linkParams, listStudentsQuery, updateGuardianBody, updateStudentBody, withdrawBody } from './students.schemas';
import type { StudentStatus, StudentsApi } from './students.types';

/** /api/students/*: students of the signed-in user's school (school id from the token only). */
export function studentsRouter(auth: AuthRuntime, students: StudentsApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const needs = (...keys: string[]) => [...base, requirePermission(auth.permissions, ...keys)];
  const sid = (req: { auth?: { schoolId: string | null } }) => req.auth!.schoolId!;
  const actor = (req: { auth?: { userId: string } }) => req.auth!.userId;

  // Classes + sections for forms and filters (anyone who may read students).
  router.get('/options', ...needs('student.read'), asyncHandler(async (req, res) => res.json({ options: await students.options(sid(req)) })));

  router.get('/', ...needs('student.read'), validate({ query: listStudentsQuery }),
    asyncHandler(async (req, res) => res.json(await students.list(sid(req), req.query as unknown as { q?: string; classId?: string; sectionId?: string; status?: StudentStatus; limit: number }))));
  router.post('/', ...needs('student.create'), validate({ body: createStudentBody }),
    asyncHandler(async (req, res) => res.status(201).json({ student: await students.create(sid(req), req.body, actor(req)) })));

  router.get('/:id', ...needs('student.read'), validate({ params: idParam }), asyncHandler(async (req, res) => res.json({ student: await students.get(sid(req), req.params.id) })));
  router.patch('/:id', ...needs('student.update'), validate({ params: idParam, body: updateStudentBody }),
    asyncHandler(async (req, res) => res.json({ student: await students.update(sid(req), req.params.id, req.body, actor(req)) })));
  router.delete('/:id', ...needs('student.delete'), validate({ params: idParam }),
    asyncHandler(async (req, res) => { await students.remove(sid(req), req.params.id, actor(req)); res.status(204).end(); }));

  router.post('/:id/withdraw', ...needs('student.withdraw'), validate({ params: idParam, body: withdrawBody }),
    asyncHandler(async (req, res) => res.json({ student: await students.withdraw(sid(req), req.params.id, req.body, actor(req)) })));
  router.post('/:id/reinstate', ...needs('student.withdraw'), validate({ params: idParam }),
    asyncHandler(async (req, res) => res.json({ student: await students.reinstate(sid(req), req.params.id, actor(req)) })));

  router.post('/:id/guardians', ...needs('student.update'), validate({ params: idParam, body: guardianBody }),
    asyncHandler(async (req, res) => res.status(201).json({ student: await students.addGuardian(sid(req), req.params.id, req.body, actor(req)) })));
  router.patch('/:id/guardians/:linkId', ...needs('student.update'), validate({ params: linkParams, body: updateGuardianBody }),
    asyncHandler(async (req, res) => res.json({ student: await students.updateGuardian(sid(req), req.params.id, req.params.linkId, req.body, actor(req)) })));
  router.delete('/:id/guardians/:linkId', ...needs('student.update'), validate({ params: linkParams }),
    asyncHandler(async (req, res) => res.json({ student: await students.removeGuardian(sid(req), req.params.id, req.params.linkId, actor(req)) })));

  return router;
}
