import { Router, type Request } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { categoryBody, categoryPatch, entryBody, entryQuery, idParam, kindQuery, monthlyQuery, reasonBody, summaryQuery } from './accounts.schemas';
import type { AccountsApi, EntryFilter, LedgerKind } from './accounts.types';

/**
 * /api/accounts/*: income and expense ledger (everything except student fees), categories and reports.
 * accounts.read (view, reports) / accounts.manage (categories, add entry, void).
 * The school id and the user come from the verified token only.
 */
export function accountsRouter(auth: AuthRuntime, accounts: AccountsApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const needs = (...keys: string[]) => [...base, requirePermission(auth.permissions, ...keys)];
  const sid = (req: Request) => req.auth!.schoolId!;
  const uid = (req: Request) => req.auth!.userId;

  router.get('/categories', ...needs('accounts.read'), validate({ query: kindQuery }),
    asyncHandler(async (req, res) => res.json(await accounts.categories(sid(req), (req.query as { kind?: LedgerKind }).kind))));
  router.post('/categories', ...needs('accounts.manage'), validate({ body: categoryBody }), asyncHandler(async (req, res) => res.status(201).json(await accounts.createCategory(sid(req), uid(req), req.body))));
  router.post('/categories/defaults', ...needs('accounts.manage'), asyncHandler(async (req, res) => res.json(await accounts.addDefaultCategories(sid(req), uid(req)))));
  router.patch('/categories/:id', ...needs('accounts.manage'), validate({ params: idParam, body: categoryPatch }), asyncHandler(async (req, res) => res.json(await accounts.updateCategory(sid(req), uid(req), req.params.id, req.body))));

  router.get('/entries', ...needs('accounts.read'), validate({ query: entryQuery }),
    asyncHandler(async (req, res) => { const q = req.query as Record<string, string | undefined>; res.json(await accounts.listEntries(sid(req), { ...q, includeVoided: q.includeVoided === 'true' } as EntryFilter)); }));
  router.post('/entries', ...needs('accounts.manage'), validate({ body: entryBody }), asyncHandler(async (req, res) => res.status(201).json(await accounts.createEntry(sid(req), uid(req), req.body))));
  router.get('/entries/:id', ...needs('accounts.read'), validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await accounts.getEntry(sid(req), req.params.id))));
  router.post('/entries/:id/void', ...needs('accounts.manage'), validate({ params: idParam, body: reasonBody }), asyncHandler(async (req, res) => res.json(await accounts.voidEntry(sid(req), uid(req), req.params.id, req.body.reason))));

  router.get('/reports/summary', ...needs('accounts.read'), validate({ query: summaryQuery }),
    asyncHandler(async (req, res) => { const q = req.query as { from?: string; to?: string }; res.json(await accounts.summary(sid(req), q.from, q.to)); }));
  router.get('/reports/monthly', ...needs('accounts.read'), validate({ query: monthlyQuery }),
    asyncHandler(async (req, res) => { const y = (req.query as { year?: string }).year; res.json(await accounts.monthly(sid(req), y ? Number(y) : undefined)); }));

  return router;
}
