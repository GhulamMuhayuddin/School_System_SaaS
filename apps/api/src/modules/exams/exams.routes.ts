import { Router, type Request } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { bandsBody, classParam, createExamBody, idParam, listQuery, marksBody, paperParam, papersBody, publishBody, resultsQuery, studentParam, updateExamBody } from './exams.schemas';
import type { Caller, ExamsApi } from './exams.types';

/**
 * /api/exams/*: exams, papers, marks, results and the grading scale.
 * exam.read (view, results) / exam.manage (exams, papers, grades, marks for any subject) / exam.marks.enter (enter marks for own subjects)
 * / exam.result.publish (publish and unpublish). The school id and the caller come from the verified token only.
 */
export function examsRouter(auth: AuthRuntime, exams: ExamsApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const needs = (...keys: string[]) => [...base, requirePermission(auth.permissions, ...keys)];
  const sid = (req: Request) => req.auth!.schoolId!;
  const uid = (req: Request) => req.auth!.userId;
  const caller = async (req: Request): Promise<Caller> => ({ userId: uid(req), canManage: (await auth.permissions.get(req.auth!.roleId)).has('exam.manage') });

  router.get('/grade-bands', ...needs('exam.read'), asyncHandler(async (req, res) => res.json(await exams.gradeBands(sid(req)))));
  router.put('/grade-bands', ...needs('exam.manage'), validate({ body: bandsBody }),
    asyncHandler(async (req, res) => res.json(await exams.setGradeBands(sid(req), uid(req), req.body.bands))));

  router.get('/papers/:paperId/marks', ...needs('exam.read'), validate({ params: paperParam }),
    asyncHandler(async (req, res) => res.json(await exams.paperMarks(sid(req), req.params.paperId, await caller(req)))));
  router.put('/papers/:paperId/marks', ...needs('exam.marks.enter'), validate({ params: paperParam, body: marksBody }),
    asyncHandler(async (req, res) => res.json(await exams.saveMarks(sid(req), req.params.paperId, req.body.entries, await caller(req)))));

  router.get('/', ...needs('exam.read'), validate({ query: listQuery }),
    asyncHandler(async (req, res) => res.json(await exams.listExams(sid(req), (req.query as { sessionId?: string }).sessionId))));
  router.post('/', ...needs('exam.manage'), validate({ body: createExamBody }),
    asyncHandler(async (req, res) => res.status(201).json(await exams.createExam(sid(req), uid(req), req.body))));
  router.get('/:id', ...needs('exam.read'), validate({ params: idParam }),
    asyncHandler(async (req, res) => res.json(await exams.getExam(sid(req), req.params.id))));
  router.patch('/:id', ...needs('exam.manage'), validate({ params: idParam, body: updateExamBody }),
    asyncHandler(async (req, res) => res.json(await exams.updateExam(sid(req), uid(req), req.params.id, req.body))));
  router.delete('/:id', ...needs('exam.manage'), validate({ params: idParam }),
    asyncHandler(async (req, res) => { await exams.deleteExam(sid(req), uid(req), req.params.id); res.status(204).end(); }));
  router.put('/:id/classes/:classId/papers', ...needs('exam.manage'), validate({ params: classParam, body: papersBody }),
    asyncHandler(async (req, res) => res.json(await exams.setPapers(sid(req), uid(req), req.params.id, req.params.classId, req.body.papers))));
  router.get('/:id/results', ...needs('exam.read'), validate({ params: idParam, query: resultsQuery }),
    asyncHandler(async (req, res) => { const q = req.query as { classId: string; sectionId?: string }; res.json(await exams.classResults(sid(req), req.params.id, q.classId, q.sectionId)); }));
  router.get('/:id/students/:studentId/result', ...needs('exam.read'), validate({ params: studentParam }),
    asyncHandler(async (req, res) => res.json(await exams.studentResult(sid(req), req.params.id, req.params.studentId))));
  router.post('/:id/publish', ...needs('exam.result.publish'), validate({ params: idParam, body: publishBody }),
    asyncHandler(async (req, res) => res.json(await exams.publish(sid(req), uid(req), req.params.id, req.body?.force === true))));
  router.post('/:id/unpublish', ...needs('exam.result.publish'), validate({ params: idParam }),
    asyncHandler(async (req, res) => res.json(await exams.unpublish(sid(req), uid(req), req.params.id))));

  return router;
}
