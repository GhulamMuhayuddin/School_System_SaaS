import { Router, type Request } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { classParam, concessionBody, defaultersQuery, generateBody, headBody, headPatch, idParam, payBody, reasonBody, sessionQuery, structureBody, studentParam, summaryQuery, voucherQuery } from './fees.schemas';
import type { FeesApi, VoucherFilter } from './fees.types';

/**
 * /api/fees/*: fee heads, class fee structure, concessions, vouchers, receipts and reports.
 * fee.read (view) / fee.manage (setup, generate, cancel, void) / fee.collect (take a payment) / fee.report (summary, defaulters).
 * The school id and the user come from the verified token only.
 */
export function feesRouter(auth: AuthRuntime, fees: FeesApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const needs = (...keys: string[]) => [...base, requirePermission(auth.permissions, ...keys)];
  const sid = (req: Request) => req.auth!.schoolId!;
  const uid = (req: Request) => req.auth!.userId;
  const session = (req: Request) => (req.query as { sessionId?: string }).sessionId;

  router.get('/heads', ...needs('fee.read'), asyncHandler(async (req, res) => res.json(await fees.heads(sid(req)))));
  router.post('/heads', ...needs('fee.manage'), validate({ body: headBody }), asyncHandler(async (req, res) => res.status(201).json(await fees.createHead(sid(req), uid(req), req.body.name))));
  router.patch('/heads/:id', ...needs('fee.manage'), validate({ params: idParam, body: headPatch }), asyncHandler(async (req, res) => res.json(await fees.updateHead(sid(req), uid(req), req.params.id, req.body))));

  router.get('/structure/:classId', ...needs('fee.read'), validate({ params: classParam, query: sessionQuery }), asyncHandler(async (req, res) => res.json(await fees.structure(sid(req), req.params.classId, session(req)))));
  router.put('/structure/:classId', ...needs('fee.manage'), validate({ params: classParam, query: sessionQuery, body: structureBody }),
    asyncHandler(async (req, res) => res.json(await fees.setStructure(sid(req), uid(req), req.params.classId, session(req), req.body.items))));

  router.get('/concessions/:studentId', ...needs('fee.read'), validate({ params: studentParam, query: sessionQuery }), asyncHandler(async (req, res) => res.json({ concession: await fees.concession(sid(req), req.params.studentId, session(req)) })));
  router.put('/concessions/:studentId', ...needs('fee.manage'), validate({ params: studentParam, query: sessionQuery, body: concessionBody }),
    asyncHandler(async (req, res) => res.json(await fees.setConcession(sid(req), uid(req), req.params.studentId, session(req), req.body))));
  router.delete('/concessions/:studentId', ...needs('fee.manage'), validate({ params: studentParam, query: sessionQuery }),
    asyncHandler(async (req, res) => { await fees.removeConcession(sid(req), uid(req), req.params.studentId, session(req)); res.status(204).end(); }));

  router.post('/vouchers/generate', ...needs('fee.manage'), validate({ body: generateBody }), asyncHandler(async (req, res) => res.status(201).json(await fees.generate(sid(req), uid(req), req.body))));
  router.get('/vouchers', ...needs('fee.read'), validate({ query: voucherQuery }),
    asyncHandler(async (req, res) => { const q = req.query as Record<string, string | undefined>; res.json(await fees.listVouchers(sid(req), { ...q, overdue: q.overdue === 'true' } as VoucherFilter)); }));
  router.get('/vouchers/:id', ...needs('fee.read'), validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await fees.getVoucher(sid(req), req.params.id))));
  router.post('/vouchers/:id/cancel', ...needs('fee.manage'), validate({ params: idParam, body: reasonBody }), asyncHandler(async (req, res) => res.json(await fees.cancelVoucher(sid(req), uid(req), req.params.id, req.body.reason))));
  router.post('/vouchers/:id/payments', ...needs('fee.collect'), validate({ params: idParam, body: payBody }), asyncHandler(async (req, res) => res.status(201).json(await fees.pay(sid(req), uid(req), req.params.id, req.body))));

  router.get('/payments/:id', ...needs('fee.read'), validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await fees.getPayment(sid(req), req.params.id))));
  router.post('/payments/:id/void', ...needs('fee.manage'), validate({ params: idParam, body: reasonBody }), asyncHandler(async (req, res) => res.json(await fees.voidPayment(sid(req), uid(req), req.params.id, req.body.reason))));

  router.get('/reports/summary', ...needs('fee.report'), validate({ query: summaryQuery }),
    asyncHandler(async (req, res) => { const q = req.query as { from?: string; to?: string }; res.json(await fees.summary(sid(req), q.from, q.to)); }));
  router.get('/reports/defaulters', ...needs('fee.report'), validate({ query: defaultersQuery }),
    asyncHandler(async (req, res) => res.json(await fees.defaulters(sid(req), (req.query as { classId?: string }).classId))));

  return router;
}
