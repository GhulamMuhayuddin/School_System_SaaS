import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import {
  createClassBody, createSectionBody, createSessionBody, createSubjectBody, idParam, setClassSubjectsBody, updateClassBody, updateSectionBody,
  updateSessionBody, updateSubjectBody,
} from './academics.schemas';
import type { AcademicsApi } from './academics.types';

/** /api/academics/*: classes and sections of the signed-in user's school (school id from the token only). */
export function academicsRouter(auth: AuthRuntime, academics: AcademicsApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const needs = (...keys: string[]) => [...base, requirePermission(auth.permissions, ...keys)];
  const sid = (req: { auth?: { schoolId: string | null } }) => req.auth!.schoolId!;
  const actor = (req: { auth?: { userId: string } }) => req.auth!.userId;

  router.get('/classes', ...needs('academic.read'), asyncHandler(async (req, res) => res.json({ classes: await academics.listClasses(sid(req)) })));
  router.post('/classes', ...needs('academic.manage'), validate({ body: createClassBody }),
    asyncHandler(async (req, res) => res.status(201).json({ class: await academics.createClass(sid(req), req.body, actor(req)) })));
  router.patch('/classes/:id', ...needs('academic.manage'), validate({ params: idParam, body: updateClassBody }),
    asyncHandler(async (req, res) => res.json({ class: await academics.updateClass(sid(req), req.params.id, req.body, actor(req)) })));
  router.delete('/classes/:id', ...needs('academic.manage'), validate({ params: idParam }),
    asyncHandler(async (req, res) => { await academics.deleteClass(sid(req), req.params.id, actor(req)); res.status(204).end(); }));
  router.post('/classes/:id/sections', ...needs('academic.manage'), validate({ params: idParam, body: createSectionBody }),
    asyncHandler(async (req, res) => res.status(201).json({ class: await academics.createSection(sid(req), req.params.id, req.body, actor(req)) })));
  router.patch('/sections/:id', ...needs('academic.manage'), validate({ params: idParam, body: updateSectionBody }),
    asyncHandler(async (req, res) => res.json({ class: await academics.updateSection(sid(req), req.params.id, req.body, actor(req)) })));
  router.delete('/sections/:id', ...needs('academic.manage'), validate({ params: idParam }),
    asyncHandler(async (req, res) => { await academics.deleteSection(sid(req), req.params.id, actor(req)); res.status(204).end(); }));

  // Academic sessions (school years). Reading needs academic.read; changing them needs school.session.manage.
  router.get('/sessions', ...needs('academic.read'), asyncHandler(async (req, res) => res.json({ sessions: await academics.listSessions(sid(req)) })));
  router.post('/sessions', ...needs('school.session.manage'), validate({ body: createSessionBody }),
    asyncHandler(async (req, res) => res.status(201).json({ session: await academics.createSession(sid(req), req.body, actor(req)) })));
  router.patch('/sessions/:id', ...needs('school.session.manage'), validate({ params: idParam, body: updateSessionBody }),
    asyncHandler(async (req, res) => res.json({ session: await academics.updateSession(sid(req), req.params.id, req.body, actor(req)) })));
  router.post('/sessions/:id/current', ...needs('school.session.manage'), validate({ params: idParam }),
    asyncHandler(async (req, res) => res.json({ session: await academics.setCurrentSession(sid(req), req.params.id, actor(req)) })));
  router.delete('/sessions/:id', ...needs('school.session.manage'), validate({ params: idParam }),
    asyncHandler(async (req, res) => { await academics.deleteSession(sid(req), req.params.id, actor(req)); res.status(204).end(); }));

  // Subjects and which subjects each class studies.
  router.get('/subjects', ...needs('academic.read'), asyncHandler(async (req, res) => res.json({ subjects: await academics.listSubjects(sid(req)) })));
  router.post('/subjects', ...needs('academic.manage'), validate({ body: createSubjectBody }),
    asyncHandler(async (req, res) => res.status(201).json({ subject: await academics.createSubject(sid(req), req.body, actor(req)) })));
  router.patch('/subjects/:id', ...needs('academic.manage'), validate({ params: idParam, body: updateSubjectBody }),
    asyncHandler(async (req, res) => res.json({ subject: await academics.updateSubject(sid(req), req.params.id, req.body, actor(req)) })));
  router.delete('/subjects/:id', ...needs('academic.manage'), validate({ params: idParam }),
    asyncHandler(async (req, res) => { await academics.deleteSubject(sid(req), req.params.id, actor(req)); res.status(204).end(); }));
  router.get('/classes/:id/subjects', ...needs('academic.read'), validate({ params: idParam }),
    asyncHandler(async (req, res) => res.json(await academics.getClassSubjects(sid(req), req.params.id))));
  router.put('/classes/:id/subjects', ...needs('academic.manage'), validate({ params: idParam, body: setClassSubjectsBody }),
    asyncHandler(async (req, res) => res.json(await academics.setClassSubjects(sid(req), req.params.id, req.body.subjectIds, actor(req)))));

  return router;
}
