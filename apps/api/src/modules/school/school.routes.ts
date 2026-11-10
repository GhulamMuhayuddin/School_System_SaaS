import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { auditLogsQuery, createUserBody, guardianAccountBody, idParam, studentAccountBody, staffAccountBody, listUsersQuery, updateProfileBody, updateUserBody, userStatusBody } from './school.schemas';
import type { SchoolApi, UserStatus } from './school.types';

/**
 * /api/school/* : the signed-in user's OWN school. schoolId is read from the verified token only,
 * so no route accepts a school id from the client.
 */
export function schoolRouter(auth: AuthRuntime, school: SchoolApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const needs = (...keys: string[]) => [...base, requirePermission(auth.permissions, ...keys)];
  const sid = (req: { auth?: { schoolId: string | null } }) => req.auth!.schoolId!;
  const actor = (req: { auth?: { userId: string } }) => req.auth!.userId;

  router.get('/overview', ...needs('school.audit.view'), asyncHandler(async (req, res) => res.json({ overview: await school.overview(sid(req)) })));

  // The letterhead (name, address, phone) of the caller's own school, for printouts. Any signed-in member of the school may read it.
  router.get('/letterhead', ...base, asyncHandler(async (req, res) => res.json({ letterhead: await school.letterhead(sid(req)) })));

  router.get('/profile', ...needs('school.settings.manage'), asyncHandler(async (req, res) => res.json({ profile: await school.getProfile(sid(req)) })));
  router.patch('/profile', ...needs('school.settings.manage'), validate({ body: updateProfileBody }),
    asyncHandler(async (req, res) => res.json({ profile: await school.updateProfile(sid(req), req.body, actor(req)) })));

  // Managing accounts and their roles is the School Administrator's job (same permission as role management).
  router.get('/users', ...needs('school.role.manage'), validate({ query: listUsersQuery }),
    asyncHandler(async (req, res) => res.json({ users: await school.listUsers(sid(req), req.query as { q?: string; roleId?: string; status?: UserStatus }) })));
  router.post('/users', ...needs('school.role.manage'), validate({ body: createUserBody }),
    asyncHandler(async (req, res) => res.status(201).json({ user: await school.createUser(sid(req), req.body, actor(req)) })));
  router.patch('/users/:id', ...needs('school.role.manage'), validate({ params: idParam, body: updateUserBody }),
    asyncHandler(async (req, res) => res.json({ user: await school.updateUser(sid(req), req.params.id, req.body, actor(req)) })));
  router.post('/users/:id/status', ...needs('school.role.manage'), validate({ params: idParam, body: userStatusBody }),
    asyncHandler(async (req, res) => res.json({ user: await school.setUserStatus(sid(req), req.params.id, req.body.status, actor(req)) })));

  // Gives a student's guardian a parent-portal login (role "parent"). Same permission as creating any other account.
  // Gives a staff member a login with a chosen role (never parent/student/super admin).
  router.post('/staff/:id/account', ...needs('school.role.manage'), validate({ params: idParam, body: staffAccountBody }),
    asyncHandler(async (req, res) => res.status(201).json({ user: await school.createStaffAccount(sid(req), req.params.id, req.body, actor(req)) })));
  router.post('/students/:id/account', ...needs('school.role.manage'), validate({ params: idParam, body: studentAccountBody }),
    asyncHandler(async (req, res) => res.status(201).json({ user: await school.createStudentAccount(sid(req), req.params.id, req.body, actor(req)) })));
  router.post('/guardians/:id/account', ...needs('school.role.manage'), validate({ params: idParam, body: guardianAccountBody }),
    asyncHandler(async (req, res) => res.status(201).json({ user: await school.createGuardianAccount(sid(req), req.params.id, req.body, actor(req)) })));

  router.get('/audit-logs', ...needs('school.audit.view'), validate({ query: auditLogsQuery }),
    asyncHandler(async (req, res) => res.json({ logs: await school.listAuditLogs(sid(req), req.query as unknown as { action?: string; userId?: string; limit: number }) })));

  return router;
}
