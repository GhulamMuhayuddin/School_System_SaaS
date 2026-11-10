import { Router, type Request, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate } from './auth.middleware';
import { changePasswordBody, forgotPasswordBody, loginBody, resetPasswordBody } from './auth.schemas';
import type { AuthLimits, AuthRuntime, RateLimitRule, RequestMeta } from './auth.types';
import { clearRefreshCookie, parseCookies, setRefreshCookie } from './cookies';

const MINUTE = 60_000;
export const DEFAULT_AUTH_LIMITS: AuthLimits = {
  login: { windowMs: 15 * MINUTE, limit: 10 },
  forgotPassword: { windowMs: 60 * MINUTE, limit: 5 },
  resetPassword: { windowMs: 60 * MINUTE, limit: 10 },
  refresh: { windowMs: 15 * MINUTE, limit: 120 },
  changePassword: { windowMs: 15 * MINUTE, limit: 10 },
};

const limiter = (rule: RateLimitRule): RequestHandler =>
  rateLimit({
    windowMs: rule.windowMs,
    limit: rule.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a while and try again.' } },
  });

const metaOf = (req: Request): RequestMeta => ({ ip: req.ip, userAgent: req.get('user-agent') ?? undefined });

/** /api/auth/* . Responses are never cached. The refresh token only ever travels in an httpOnly cookie. */
export function authRouter(auth: AuthRuntime): Router {
  const router = Router();
  const limits: AuthLimits = { ...DEFAULT_AUTH_LIMITS, ...auth.limits };
  const requireAuth = authenticate((token) => auth.verifyAccessToken(token));
  const refreshTokenOf = (req: Request): string | undefined => parseCookies(req.headers.cookie).get(auth.cookie.name);

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.post(
    '/login',
    limiter(limits.login),
    validate({ body: loginBody }),
    asyncHandler(async (req, res) => {
      const session = await auth.service.login(req.body, metaOf(req));
      setRefreshCookie(res, auth.cookie, session.refreshToken, session.refreshExpiresAt);
      res.json({ accessToken: session.accessToken, expiresIn: session.expiresInSeconds, user: session.user });
    }),
  );

  router.post(
    '/refresh',
    limiter(limits.refresh),
    asyncHandler(async (req, res) => {
      try {
        const session = await auth.service.refresh(refreshTokenOf(req), metaOf(req));
        setRefreshCookie(res, auth.cookie, session.refreshToken, session.refreshExpiresAt);
        res.json({ accessToken: session.accessToken, expiresIn: session.expiresInSeconds, user: session.user });
      } catch (error) {
        clearRefreshCookie(res, auth.cookie);
        throw error;
      }
    }),
  );

  router.post(
    '/logout',
    asyncHandler(async (req, res) => {
      await auth.service.logout(refreshTokenOf(req), metaOf(req));
      clearRefreshCookie(res, auth.cookie);
      res.status(204).end();
    }),
  );

  router.post(
    '/logout-all',
    requireAuth,
    asyncHandler(async (req, res) => {
      await auth.service.logoutAll(req.auth!.userId, metaOf(req));
      clearRefreshCookie(res, auth.cookie);
      res.status(204).end();
    }),
  );

  router.get(
    '/me',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json({ user: await auth.service.getProfile(req.auth!) });
    }),
  );

  router.post(
    '/forgot-password',
    limiter(limits.forgotPassword),
    validate({ body: forgotPasswordBody }),
    asyncHandler(async (req, res) => {
      await auth.service.forgotPassword(req.body.email, metaOf(req));
      // Same answer whether or not the email exists.
      res.json({ message: 'If an account exists for this email, a password reset link has been sent.' });
    }),
  );

  router.post(
    '/reset-password',
    limiter(limits.resetPassword),
    validate({ body: resetPasswordBody }),
    asyncHandler(async (req, res) => {
      await auth.service.resetPassword(req.body.token, req.body.password, metaOf(req));
      clearRefreshCookie(res, auth.cookie);
      res.status(204).end();
    }),
  );

  router.post(
    '/change-password',
    limiter(limits.changePassword),
    requireAuth,
    validate({ body: changePasswordBody }),
    asyncHandler(async (req, res) => {
      await auth.service.changePassword(req.auth!.userId, req.body.currentPassword, req.body.newPassword, metaOf(req));
      clearRefreshCookie(res, auth.cookie);
      res.status(204).end();
    }),
  );

  return router;
}
