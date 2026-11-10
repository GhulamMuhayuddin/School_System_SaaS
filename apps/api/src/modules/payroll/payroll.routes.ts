import { Router, type Request } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { idParam, payBody, runBody, salaryBody, salaryQuery, slipPatch, staffParam, voidBody } from './payroll.schemas';
import type { PayrollApi } from './payroll.types';

/**
 * /api/payroll/*: salaries, monthly payroll runs and payslips.
 *  payroll.read = view. payroll.manage (HR) = set salaries, make / recalculate / finalize runs, adjust payslips.
 *  Paying a payslip writes a salary expense into Accounts, so it needs payroll.read AND accounts.manage (accountant, school admin).
 *  GET /payslips/:id (payroll.read) and GET /my/:id (own only) return one payslip with the school header for printing.
 *  GET /my is for any school user and only ever returns the caller's own finalized payslips. School id and caller come from the verified token only.
 */
export function payrollRouter(auth: AuthRuntime, payroll: PayrollApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const needs = (...keys: string[]) => [...base, requirePermission(auth.permissions, ...keys)];
  const read = needs('payroll.read');
  const manage = needs('payroll.read', 'payroll.manage');
  const pay = needs('payroll.read', 'accounts.manage');
  const sid = (req: Request) => req.auth!.schoolId!;
  const uid = (req: Request) => req.auth!.userId;

  router.get('/my', ...base, asyncHandler(async (req, res) => res.json({ payslips: await payroll.mySlips(sid(req), uid(req)) })));

  router.get('/my/:id', ...base, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await payroll.mySlip(sid(req), uid(req), req.params.id))));

  router.get('/salaries', ...read, validate({ query: salaryQuery }), asyncHandler(async (req, res) => {
    const q = req.query as { q?: string; missing?: string };
    res.json(await payroll.listSalaries(sid(req), { q: q.q, missing: q.missing === 'true' }));
  }));
  router.put('/salaries/:staffId', ...manage, validate({ params: staffParam, body: salaryBody }), asyncHandler(async (req, res) => res.json(await payroll.setSalary(sid(req), uid(req), req.params.staffId, req.body))));

  router.get('/runs', ...read, asyncHandler(async (req, res) => res.json({ runs: await payroll.listRuns(sid(req)) })));
  router.post('/runs', ...manage, validate({ body: runBody }), asyncHandler(async (req, res) => res.status(201).json(await payroll.createRun(sid(req), uid(req), req.body.period))));
  router.get('/runs/:id', ...read, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await payroll.getRun(sid(req), req.params.id))));
  router.delete('/runs/:id', ...manage, validate({ params: idParam }), asyncHandler(async (req, res) => { await payroll.deleteRun(sid(req), uid(req), req.params.id); res.status(204).end(); }));
  router.post('/runs/:id/regenerate', ...manage, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await payroll.regenerate(sid(req), uid(req), req.params.id))));
  router.post('/runs/:id/finalize', ...manage, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await payroll.finalize(sid(req), uid(req), req.params.id))));
  router.post('/runs/:id/reopen', ...manage, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await payroll.reopen(sid(req), uid(req), req.params.id))));

  router.get('/payslips/:id', ...read, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await payroll.getSlip(sid(req), req.params.id))));
  router.patch('/payslips/:id', ...manage, validate({ params: idParam, body: slipPatch }), asyncHandler(async (req, res) => res.json(await payroll.updateSlip(sid(req), uid(req), req.params.id, req.body))));
  router.post('/payslips/:id/pay', ...pay, validate({ params: idParam, body: payBody }), asyncHandler(async (req, res) => res.json(await payroll.pay(sid(req), uid(req), req.params.id, req.body))));
  router.post('/payslips/:id/void-payment', ...pay, validate({ params: idParam, body: voidBody }), asyncHandler(async (req, res) => res.json(await payroll.voidPayment(sid(req), uid(req), req.params.id, req.body.reason))));

  return router;
}
