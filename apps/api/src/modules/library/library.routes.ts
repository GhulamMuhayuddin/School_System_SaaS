import { Router, type Request } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { bookBody, bookListQuery, bookPatch, copiesBody, copyStatusBody, fineBody, idParam, issueBody, loanListQuery, settingsBody } from './library.schemas';
import type { LibraryApi } from './library.types';

/**
 * /api/library/*: books and copies, the issue desk, fines and the library rules of the school.
 * library.read = view; library.issue = issue, return, renew and settle fines; library.manage = catalogue and rules.
 * Parents and students do not hold these permissions; they use /api/portal. School id and caller come from the verified token only.
 */
export function libraryRouter(auth: AuthRuntime, library: LibraryApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const needs = (...keys: string[]) => [...base, requirePermission(auth.permissions, ...keys)];
  const read = needs('library.read');
  const desk = needs('library.read', 'library.issue');
  const manage = needs('library.read', 'library.manage');
  const sid = (req: Request) => req.auth!.schoolId!;
  const uid = (req: Request) => req.auth!.userId;

  router.get('/summary', ...read, asyncHandler(async (req, res) => res.json(await library.summary(sid(req)))));
  router.get('/settings', ...read, asyncHandler(async (req, res) => res.json(await library.settings(sid(req)))));
  router.put('/settings', ...manage, validate({ body: settingsBody }), asyncHandler(async (req, res) => res.json(await library.saveSettings(sid(req), uid(req), req.body))));

  router.get('/books', ...read, validate({ query: bookListQuery }), asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    res.json(await library.listBooks(sid(req), { q: q.q, category: q.category, availableOnly: q.available === 'true', includeInactive: q.includeInactive === 'true' }));
  }));
  router.post('/books', ...manage, validate({ body: bookBody }), asyncHandler(async (req, res) => res.status(201).json(await library.createBook(sid(req), uid(req), req.body))));
  router.get('/books/:id', ...read, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await library.getBook(sid(req), req.params.id))));
  router.patch('/books/:id', ...manage, validate({ params: idParam, body: bookPatch }), asyncHandler(async (req, res) => res.json(await library.updateBook(sid(req), uid(req), req.params.id, req.body))));
  router.post('/books/:id/copies', ...manage, validate({ params: idParam, body: copiesBody }), asyncHandler(async (req, res) => res.status(201).json(await library.addCopies(sid(req), uid(req), req.params.id, req.body.count))));
  router.patch('/copies/:id', ...manage, validate({ params: idParam, body: copyStatusBody }), asyncHandler(async (req, res) => res.json(await library.setCopyStatus(sid(req), uid(req), req.params.id, req.body.status))));

  router.get('/loans', ...read, validate({ query: loanListQuery }), asyncHandler(async (req, res) => res.json(await library.listLoans(sid(req), req.query as Record<string, string | undefined>))));
  router.post('/loans', ...desk, validate({ body: issueBody }), asyncHandler(async (req, res) => res.status(201).json(await library.issue(sid(req), uid(req), req.body))));
  router.post('/loans/:id/return', ...desk, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await library.returnLoan(sid(req), uid(req), req.params.id))));
  router.post('/loans/:id/renew', ...desk, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await library.renew(sid(req), uid(req), req.params.id))));
  router.post('/loans/:id/fine', ...desk, validate({ params: idParam, body: fineBody }), asyncHandler(async (req, res) => res.json(await library.settleFine(sid(req), uid(req), req.params.id, req.body.action))));

  return router;
}
