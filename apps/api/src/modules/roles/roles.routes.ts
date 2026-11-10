import { Router } from 'express';
import { PERMISSION_CATALOG } from '@nexora/shared';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import type { RolesApi } from './roles.service';

/** Read-only RBAC endpoints for School Administrators (permission school.role.manage). Editing roles comes with the school admin panel. */
export function rolesRouter(auth: AuthRuntime, roles: RolesApi): Router {
  const router = Router();
  const guard = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool, requirePermission(auth.permissions, 'school.role.manage')];

  router.get(
    '/roles',
    ...guard,
    asyncHandler(async (req, res) => {
      // schoolId comes from the verified token, never from the request.
      res.json({ roles: await roles.listRoles(req.auth!.schoolId!) });
    }),
  );

  router.get('/permissions', ...guard, (_req, res) => {
    // Platform permissions belong to the Super Administrator and are never offered to schools.
    res.json({ modules: Object.fromEntries(Object.entries(PERMISSION_CATALOG).filter(([module]) => module !== 'platform')) });
  });

  return router;
}
