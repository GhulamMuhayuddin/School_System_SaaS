import type { RequestHandler } from 'express';
import { forbidden, unauthorized } from '../../utils/errors';
import type { PermissionLookup } from './auth.types';
import type { AuthContext } from './tokens';

/** Verifies "Authorization: Bearer <access token>" and sets req.auth. Rejects with 401 otherwise. */
export function authenticate(verify: (token: string) => Promise<AuthContext>): RequestHandler {
  return async (req, _res, next) => {
    const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '');
    if (!match) return next(unauthorized());
    try {
      req.auth = await verify(match[1]);
      return next();
    } catch {
      return next(unauthorized('Invalid or expired access token'));
    }
  };
}

/** The route is only for school users (a token that carries a school). Platform users get 403. */
export const requireSchool: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  if (!req.auth.schoolId) return next(forbidden('This action needs a school account'));
  return next();
};

/** The route is only for platform users (a token with NO school: the Super Administrator). School users get 403. */
export const requirePlatform: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  if (req.auth.schoolId) return next(forbidden('This action is only for platform administrators'));
  return next();
};

/** Requires ALL of the listed permission keys. Must run after authenticate(). */
export function requirePermission(permissions: PermissionLookup, ...required: string[]): RequestHandler {
  return async (req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    try {
      const granted = await permissions.get(req.auth.roleId);
      if (required.every((key) => granted.has(key))) return next();
      return next(forbidden());
    } catch (error) {
      return next(error);
    }
  };
}

/** Requires AT LEAST ONE of the listed permission keys (for screens shared by two kinds of user). Must run after authenticate(). */
export function requireAnyPermission(permissions: PermissionLookup, ...anyOf: string[]): RequestHandler {
  return async (req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    try {
      const granted = await permissions.get(req.auth.roleId);
      if (anyOf.some((key) => granted.has(key))) return next();
      return next(forbidden());
    } catch (error) {
      return next(error);
    }
  };
}
