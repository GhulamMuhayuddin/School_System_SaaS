import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type { Env } from '../../config/env';
import { AuthService } from './auth.service';
import type { AuthRuntime } from './auth.types';
import { createEmailService } from './email';
import { PermissionResolver, loadRolePermissionKeys } from './permission-resolver';
import { AccessTokenService } from './tokens';

/** Wires the real authentication stack (database, tokens, email) from validated environment settings. */
export function createAuthRuntime(env: Env, prisma: PrismaClient, logger: Logger): AuthRuntime {
  const tokens = new AccessTokenService(env.JWT_ACCESS_SECRET, env.ACCESS_TOKEN_TTL_MINUTES);
  const permissions = new PermissionResolver((roleId) => loadRolePermissionKeys(prisma, roleId));
  const service = new AuthService({
    prisma,
    tokens,
    permissions,
    email: createEmailService(env, logger),
    logger,
    config: {
      maxLoginAttempts: env.LOGIN_MAX_ATTEMPTS,
      lockoutMinutes: env.LOGIN_LOCKOUT_MINUTES,
      sessionHours: env.SESSION_HOURS,
      sessionDaysRemember: env.SESSION_DAYS_REMEMBER,
      resetTokenMinutes: env.RESET_TOKEN_MINUTES,
      appBaseUrl: env.APP_BASE_URL,
    },
  });
  return {
    service,
    verifyAccessToken: (token) => tokens.verify(token),
    permissions,
    cookie: { name: 'nexora_rt', secure: env.COOKIE_SECURE },
  };
}
