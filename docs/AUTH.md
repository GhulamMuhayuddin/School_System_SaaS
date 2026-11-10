# Authentication and authorization (Phase 3A, backend)

Status: written in v0.3.0. NOT yet run by the assistant (no network in the build environment). Verify with the commands in HANDOFF.md.

## Design
- **Access token**: JWT (HS256, library `jose`), 15 minutes, sent as `Authorization: Bearer ...`, kept in memory by the web app. Claims: `sub` (user id), `sch` (school id or null), `rid` (role id), `rk` (role key), issuer `nexora-school-erp`, audience `nexora-web`. Algorithm is pinned, so `alg: none` and other secrets are rejected.
- **Refresh token**: opaque random 256-bit value in an `httpOnly`, `SameSite=Strict`, `Path=/api/auth` cookie named `nexora_rt` (`Secure` when `COOKIE_SECURE=true`). Only its SHA-256 hash is stored (`refresh_tokens`). It never appears in JSON.
- **Rotation + reuse detection**: every `/auth/refresh` revokes the presented token and issues a new one in the same `familyId`. If an already-revoked token is presented again later than 10 s after its rotation (the 10 s window covers two tabs racing), the whole family is revoked (theft assumed) and an audit row `auth.refresh_reuse_detected` is written. The absolute session end stays fixed through rotations (`SESSION_HOURS`, or `SESSION_DAYS_REMEMBER` with "Remember me").
- **Passwords**: Argon2id. Minimum 8 characters (max 128).
- **Login hardening**: generic "Invalid email or password" for wrong password and unknown email (a dummy hash is verified so timing is similar); lockout after `LOGIN_MAX_ATTEMPTS` failures for `LOGIN_LOCKOUT_MINUTES` (HTTP 423 `ACCOUNT_LOCKED`); per-IP rate limits on login / forgot / reset / refresh / change-password (HTTP 429 `RATE_LIMITED`); inactive users and suspended schools are refused (403 `ACCOUNT_DISABLED`, `SCHOOL_SUSPENDED`) only after the password was correct.
- **Password reset**: `/auth/forgot-password` always answers the same message. A one-time token (hash stored, valid `RESET_TOKEN_MINUTES`) is emailed as `APP_BASE_URL/reset-password?token=...`. Using it sets the new password, clears the lockout, and revokes every session. Older unused reset tokens are invalidated when a new one is requested.
- **Change password** (signed in): needs the current password; ends every session (the user signs in again).
- **Audit log** rows for: login, failed login, lockout, blocked login, logout, logout-all, refresh reuse, reset requested/completed, password changed/failed.

## Authorization (RBAC) and tenancy
- Permissions live in `packages/shared/src/permissions.ts` (72 keys, 13 system roles). The matrix was reviewed in Phase 3A (teacher no longer has `homework.submit`; tests in `permissions.test.ts`). **Re-run `pnpm db:seed` after any change**: it rewrites `role_permissions`.
- Middleware (`modules/auth/auth.middleware.ts`): `authenticate(verify)` -> sets `req.auth`; `requireSchool` -> 403 for platform users on school routes; `requirePermission(resolver, ...keys)` -> requires ALL keys (403 otherwise). Permissions are loaded per role id and cached 60 s.
- **The school id always comes from the verified token** (`req.auth.schoolId`), never from body/query/params. School data is read through `forSchool(prisma, schoolId)`, so PostgreSQL Row Level Security also enforces isolation.
- Example protected, tenant-scoped endpoints: `GET /api/roles`, `GET /api/permissions` (permission `school.role.manage`).

## Environment variables (apps/api/.env)
`JWT_ACCESS_SECRET` (required, 32+ chars; generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`), `ACCESS_TOKEN_TTL_MINUTES` (15), `SESSION_HOURS` (24), `SESSION_DAYS_REMEMBER` (30), `COOKIE_SECURE`, `LOGIN_MAX_ATTEMPTS` (5), `LOGIN_LOCKOUT_MINUTES` (15), `RESET_TOKEN_MINUTES` (60), `APP_BASE_URL`, `EMAIL_TRANSPORT` (`console` | `smtp`), `EMAIL_FROM`, `SMTP_HOST/PORT/SECURE/USER/PASS`. In production the API refuses to start unless `COOKIE_SECURE=true` and `EMAIL_TRANSPORT=smtp`.

## Email
`EMAIL_TRANSPORT=console` only writes the email (including the reset link) to the API log; **nothing is sent**. Real delivery needs `EMAIL_TRANSPORT=smtp` with working SMTP credentials (not tested here: no SMTP server was available).

## Known limitations / decisions to revisit
1. Access tokens are stateless: a role change, deactivation or school suspension takes effect for API calls within 15 minutes (immediately for refresh and login). Shorten `ACCESS_TOKEN_TTL_MINUTES` if that is too slow.
2. Login is by **email only**. The web login placeholder now says "Email Address" (changed in v0.3.1). Add a `username` column only if schools want usernames (decision needed from the product owner).
3. Google / Microsoft / Apple sign-in and public "Register" are not built (not in the master requirements); their buttons only show an "not available yet" message in the web app.
4. `refresh_tokens` and `password_reset_tokens` have no `school_id`, so they are not under RLS; they are protected by token secrecy (only hashes stored) and are only reached through the auth service.
5. Rate limits are in-memory per API process; use a shared store (Redis) if the API is scaled to several instances.
6. Two-factor authentication is not implemented.
