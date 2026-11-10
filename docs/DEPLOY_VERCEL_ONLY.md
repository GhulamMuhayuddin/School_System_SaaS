# Free TEST deployment, everything on Vercel + Neon (Phase 20C, v0.20.7)
Use this when Render will not accept your card. Web and API live in ONE Vercel project; the API runs as a serverless function (`api/index.js`), the database is Neon. Tests and demos only: no backups, no uptime promise, no real school data.

**Honest status:** written, never deployed. The API was built for a normal always-on server; running it as a Vercel function is new and the first deployment may need one or two fixes (Prisma engine, Argon2 file tracing). Send the build log and they get fixed.

What changed for this: `api/index.js` (entry), `vercel.json` (build, `/api` -> function, region Singapore `sin1` to sit next to Neon, function limits), `src/server.ts` (does not listen on Vercel, exports the app), `schema.prisma` generator (`rhel-openssl-3.0.x` engine for Vercel; no migration needed).

Known limits on serverless: the per-IP request limiter (600 / 15 min, 10 logins) is counted per function instance, so it is weaker than on a server; the per-ACCOUNT lockout is in the database and works fully. A request may take 30 s at most (`maxDuration`); very big jobs (voucher generation for a whole school) are better done class by class. Connections: `connection_limit=1` per function instance; keep the Neon direct host.

## Steps (database from docs/DEPLOY_FREE_TEST.md steps 1-3 is already done)
1. vercel.com -> Add New -> Project -> import the GitHub repo. Leave Root Directory as is. Settings come from vercel.json. Framework: Other.
2. Before pressing Deploy open **Environment Variables**, paste the content of `vercel.env` (fill the three CHANGE-ME values first). `CORS_ORIGINS` and `APP_BASE_URL` stay `https://placeholder.example` for now.
3. Deploy. Copy the address (like `https://your-project.vercel.app`).
4. Environment Variables: set `CORS_ORIGINS` and `APP_BASE_URL` to that exact address (https, no slash). Deployments -> the latest one -> Redeploy.
5. Check `https://your-project.vercel.app/api/health/ready` -> `ready`. Then sign in with the SEED_SUPERADMIN account and change the password.

## If the build or the function fails
| Message | Meaning / fix |
|---|---|
| build: `prisma` or `@prisma/client` not found | install step did not generate; send the log |
| runtime: `Query engine library ... not found` / `rhel-openssl-3.0.x` | engine not included in the function; send the log, `includeFiles` in vercel.json needs adjusting |
| runtime: `Cannot find module ... argon2` / `.node` file | argon2 binary not traced; same fix place |
| `FUNCTION_INVOCATION_TIMEOUT` | first request after Neon slept; retry; or a job longer than 30 s |
| `Invalid environment` in function log | the message names the setting |
| `P1001` cannot reach database | wrong string, or Neon is waking up: retry |
