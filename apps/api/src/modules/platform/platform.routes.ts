import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requirePlatform } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import {
  auditLogsQuery, createPlanBody, createPlatformAdminBody, createSchoolBody, idParam, listSchoolsQuery,
  platformAdminStatusBody, schoolStatusBody, subscriptionBody, updatePlanBody, updateSchoolBody,
} from './platform.schemas';
import type { PlatformApi } from './platform.types';

/**
 * /api/platform/* is only for platform users (Super Administrator: no school in the token).
 * Each group also needs its own permission, so a platform role can be limited later.
 */
export function platformRouter(auth: AuthRuntime, platform: PlatformApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requirePlatform];
  const needs = (...keys: string[]) => [...base, requirePermission(auth.permissions, ...keys)];
  const actor = (req: { auth?: { userId: string } }) => req.auth!.userId;

  // ---- schools
  router.get('/schools', ...needs('platform.school.manage'), validate({ query: listSchoolsQuery }),
    asyncHandler(async (req, res) => res.json({ schools: await platform.listSchools(req.query as { q?: string; status?: 'ACTIVE' | 'SUSPENDED' }) })));
  router.post('/schools', ...needs('platform.school.manage'), validate({ body: createSchoolBody }),
    asyncHandler(async (req, res) => res.status(201).json({ school: await platform.createSchool(req.body, actor(req)) })));
  router.get('/schools/:id', ...needs('platform.school.manage'), validate({ params: idParam }),
    asyncHandler(async (req, res) => res.json({ school: await platform.getSchool(req.params.id) })));
  router.patch('/schools/:id', ...needs('platform.school.manage'), validate({ params: idParam, body: updateSchoolBody }),
    asyncHandler(async (req, res) => res.json({ school: await platform.updateSchool(req.params.id, req.body, actor(req)) })));
  router.post('/schools/:id/status', ...needs('platform.school.manage'), validate({ params: idParam, body: schoolStatusBody }),
    asyncHandler(async (req, res) => res.json({ school: await platform.setSchoolStatus(req.params.id, req.body.status, actor(req)) })));
  router.put('/schools/:id/subscription', ...needs('platform.plan.manage'), validate({ params: idParam, body: subscriptionBody }),
    asyncHandler(async (req, res) => res.json({ school: await platform.setSubscription(req.params.id, req.body, actor(req)) })));

  // ---- plans
  router.get('/plans', ...needs('platform.plan.manage'),
    asyncHandler(async (_req, res) => res.json({ plans: await platform.listPlans() })));
  router.post('/plans', ...needs('platform.plan.manage'), validate({ body: createPlanBody }),
    asyncHandler(async (req, res) => res.status(201).json({ plan: await platform.createPlan(req.body, actor(req)) })));
  router.patch('/plans/:id', ...needs('platform.plan.manage'), validate({ params: idParam, body: updatePlanBody }),
    asyncHandler(async (req, res) => res.json({ plan: await platform.updatePlan(req.params.id, req.body, actor(req)) })));

  // ---- analytics + logs
  router.get('/analytics', ...needs('platform.analytics.view'),
    asyncHandler(async (_req, res) => res.json({ analytics: await platform.analytics() })));
  router.get('/audit-logs', ...needs('platform.logs.view'), validate({ query: auditLogsQuery }),
    asyncHandler(async (req, res) => res.json({ logs: await platform.listAuditLogs(req.query as unknown as { schoolId?: string; action?: string; limit: number }) })));

  // ---- platform administrators
  router.get('/admins', ...needs('platform.admin.manage'),
    asyncHandler(async (_req, res) => res.json({ admins: await platform.listPlatformAdmins() })));
  router.post('/admins', ...needs('platform.admin.manage'), validate({ body: createPlatformAdminBody }),
    asyncHandler(async (req, res) => res.status(201).json({ admin: await platform.createPlatformAdmin(req.body, actor(req)) })));
  router.post('/admins/:id/status', ...needs('platform.admin.manage'), validate({ params: idParam, body: platformAdminStatusBody }),
    asyncHandler(async (req, res) => res.json({ admin: await platform.setPlatformAdminStatus(req.params.id, req.body.status, actor(req)) })));

  return router;
}
