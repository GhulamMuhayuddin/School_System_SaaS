# Security notes (Phase 19A v0.19.0, 19B v0.19.1)

What was **checked by reading the code and running scripts** (no database, no network and no browser were available in the build environment, so nothing below was attacked or load-tested):

| Area | Finding |
|---|---|
| Authentication | Argon2id passwords; 15-minute HS256 access tokens with the algorithm pinned on verify; refresh tokens stored only as hashes, rotated, with reuse detection by family; reset tokens hashed, single-use, expire; reset and password change revoke every session; login runs a dummy hash for unknown emails (no timing or message difference); lockout after repeated failures. |
| Rate limits | 600 requests / 15 min per IP on all of /api, plus stricter limits on login (10), forgot password (5), reset (10), change password (10). |
| Authorisation | 255 of 265 routes start with a permission guard; the other 10 are login, refresh, logout, logout-all, me, forgot/reset/change password and the two health checks, by design. The new test `route-guards.test.ts` fails if a future route is added without a guard. |
| Tenant isolation | 60 of 66 tables carry `school_id`; Row Level Security is applied to every one of them automatically by `pnpm db:rls`, FORCED, with `nexora_app` unable to bypass it. The 6 others are platform-wide (schools, plans, permissions, role-permissions) or user-scoped (refresh and reset tokens). `withBypass` is used only by auth, platform admin and the seed. |
| SQL | Only 10 raw queries, all `SELECT ... FOR UPDATE` with tagged-template parameters (no string building). |
| Input | zod validation on request bodies, params and queries; list `limit` values are capped; JSON bodies capped at 1 MB. |
| Logs | Authorization, cookies and password fields are redacted. |
| Errors | Unknown errors return a generic 500 with a request id; internals are not leaked. |

## Fixed in v0.19.0
- Production now refuses to start unless every CORS origin is an exact `https://` address (no `*`, no `http://`, and not the localhost default).
- Complaints summary loaded every complaint into memory to count them; it now runs four COUNT queries.
- New tests: route guards (every route is guarded), production CORS rules.

## Phase 19B (v0.19.1): dependency audit, browser headers, performance review
**Dependency audit (`pnpm audit`, run in the build environment, which had network access).** Before: 40 findings (3 critical, 7 high, 28 moderate, 2 low), 25 of them in code that ships to production. After the upgrades below: **0 known vulnerabilities**. Re-run `pnpm audit` before every release; new advisories appear all the time.

| Package | From -> to | Why |
|---|---|---|
| nodemailer (API) | 6.9 -> 10.4 | 22 advisories (address-parser denial of service, header and SMTP command injection, TLS and file-access bypasses). Only `email.ts` uses it (SMTP send of reset mails), which compiles unchanged. |
| zod (API and web) | 3.23 -> 4.6 | High: memory exhaustion on oversized constrained collections. Needed code changes: env defaults, the validate middleware cast, the attendance range helper type, `z.coerce` removed from the student form. |
| @hookform/resolvers (web) | 3.9 -> 7.0 | Required for zod 4 (the old one silently dropped some form errors). |
| react-router-dom (web) | 6.28 -> 7.18 | Open redirect via backslash in links / navigate. |
| vite 5 -> 6.4, vitest 2 -> 4.1 (dev only) | | Critical: Vitest UI file read / run, tinypool prototype pollution; moderate: dev-server file access. Not part of the production build, but developers run them. Vite 6 (not 7) keeps Node 20 supported. |

**Browser security headers.** `apps/web/public/_headers` (Netlify / Cloudflare Pages format, copied into `dist` by the build) and `docs/deploy/nginx-web.conf.example` set: a Content-Security-Policy with `script-src 'self'` (no inline script, no eval, nothing from other sites), `frame-ancestors 'none'`, `object-src 'none'`, HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP. `style-src` keeps `'unsafe-inline'` because React writes a few `style=""` attributes (chart sizes). `connect-src 'self'` assumes the API is served from the same address under `/api`; if it is on another address add it there. A test (`src/test/security-headers.test.ts`) fails if someone weakens the policy, if the nginx copy drifts, or if `index.html` gains an inline script. The API now sends `Cache-Control: no-store` on every `/api` response (private school data must not sit in a browser or proxy cache) and has tests for its headers and CORS.

**Performance review (code reading plus one fix; NO load test, NO real data).**
- Indexes: every table with `school_id` has an index that starts with it, except 4 whose lookups use other indexes that fit (student-guardian links, complaint notes, announcement reads, counters).
- Fixed: the fee summary loaded **every voucher of the school, every month, for ever** just to add numbers up. It now asks the database for sums (`aggregate` / `groupBy`); an equivalence test (200 generated voucher sets) shows the numbers are identical to the old calculation. Unlike the other fee reports, that one runs on every dashboard visit.
- Not changed, but will grow: the defaulters report and the accounts ledger still load their matching rows (bounded by overdue vouchers / the chosen date range); fee voucher generation creates vouchers one by one inside one transaction (fine for a class, slow for 2,000 students at once: generate class by class). Measure these on real data before the first big school.

## Known limits (be honest with the school)
- Access tokens carry the role, so a role change or deactivation applies within 15 minutes (refresh tokens are revoked immediately).
- No two-factor login, no password-breach check, no IP allow-list for the platform admin.
- No malware scanning because there are no file uploads yet.
- Dependencies were clean on the day of v0.19.1 (see above); that is a snapshot, not a promise.
- No load test, no penetration test, and the headers were checked from their files and tests only, not from a live server: open the live site once with the browser dev tools (Network tab, response headers; Console must show no CSP violations) and test it with an online header checker before the first real school goes live (Phase 20 checklist).

## Must be right at deployment (Phase 20)
1. Serve the web app and API over HTTPS only; set `COOKIE_SECURE=true`.
2. Behind a reverse proxy set `TRUST_PROXY=true`, otherwise every user shares the proxy's IP and the rate limits lock everybody out together.
3. `CORS_ORIGINS` = the exact web address(es). `JWT_ACCESS_SECRET` = 48+ random characters, never committed.
4. Run the API as `nexora_app` (not the owner), run `pnpm db:rls` after every migration, back up the database daily and test a restore.
5. Real SMTP configured; the console email transport is refused in production.
