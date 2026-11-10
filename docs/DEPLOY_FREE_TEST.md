# Free TEST deployment: Vercel (web) + Render (API) + Neon (database)  (Phase 20B, v0.20.6)
For demos and testing only. Do NOT put a real school's data here: free plans give no backup or uptime promise, and the API sleeps when idle (the first request after a pause can take about a minute). For a real school use docs/DEPLOYMENT.md on a small paid server.
Written but NOT tried here (no network). Free-plan rules change: check each site's pricing page before you sign up.

How it fits: the browser only ever talks to the Vercel address. Vercel forwards `/api/*` to Render (see vercel.json), so cookies and login work as on one site. Render talks to Neon.

## 1. Neon (database)
1. Sign up at neon.tech, create a project (region near you; pick Postgres 16 or newer).
2. Copy the **direct** connection string (the host WITHOUT `-pooler`). It looks like `postgresql://OWNER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`. This is the OWNER connection.
3. Neon -> SQL Editor, run (own password, no `@ : / ? # %` in it):
```
CREATE ROLE nexora_app LOGIN PASSWORD 'CHANGE-ME' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```
4. The app connection string is the same as step 2 with `nexora_app:CHANGE-ME` instead of `OWNER:PASSWORD`, and add `&connection_limit=5` at the end.

## 2. Create the tables from your PC (Windows cmd, project root)
```
set DIRECT_URL=<owner string from step 1.2>
set DATABASE_URL=<app string from step 1.4>
set JWT_ACCESS_SECRET=<any 48+ characters>
set SEED_SUPERADMIN_EMAIL=you@example.com
set SEED_SUPERADMIN_PASSWORD=<strong password>
pnpm --filter @nexora/api db:deploy
pnpm db:rls
pnpm db:seed
```
(`set` values stay only in that cmd window. They override apps\api\.env.) Each command must finish without error. This is how the free setup gets its tables, roles and first super admin: Render's free plan has no shell or release command.

## 3. Put the project on GitHub
Vercel and Render read your code from GitHub. Create a **private** repository, then in the project folder:
```
git init
git add .
git commit -m "Nexora School ERP"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/YOUR-REPO.git
git push -u origin main
```
`.gitignore` already keeps `.env` files out. Never push a file that holds real passwords.

## 4. Brevo (free e-mail)
Production mode refuses to start without real e-mail. Sign up at brevo.com, verify a sender address, open its SMTP settings and note host, port (587), login and SMTP key.

## 5. Render (API)
1. render.com -> New -> Blueprint -> pick your repo (it reads render.yaml).
2. Fill the secret values it asks for:
   - `DATABASE_URL` = app string (step 1.4)
   - `JWT_ACCESS_SECRET` = 48+ random characters
   - `EMAIL_FROM`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` from Brevo
   - `CORS_ORIGINS` and `APP_BASE_URL` = put `https://placeholder.example` now, fix in step 7
3. Wait for the first build (minutes). Copy the service address, like `https://nexora-api-abcd.onrender.com`. `https://<that>/api/health/ready` must say `ready`.

## 6. Vercel (web)
1. In your repo edit `vercel.json`: replace `https://CHANGE-ME-nexora-api.onrender.com` with your Render address (keep `/api/:path*`). Commit and push.
2. vercel.com -> Add New -> Project -> import the repo. Leave Root Directory as the repo root; the build settings come from vercel.json. Deploy.
3. Copy the address, like `https://your-project.vercel.app`.

## 7. Connect them
Render -> your service -> Environment: set `CORS_ORIGINS` and `APP_BASE_URL` to the exact Vercel address (https, no slash at the end). Save: Render redeploys.

## 8. Check
- `https://your-project.vercel.app/api/health/ready` shows `ready`.
- Open `https://your-project.vercel.app`, sign in with the SEED_SUPERADMIN account, change the password.
- Forgot password: the Brevo mail arrives.
- Lock-out test: fail a password 5 times for one test account in one browser; a different account in another browser/phone must still sign in. If everybody is locked together, `TRUST_PROXY_HOPS` is wrong: in Render try 1 instead of 2 (or 3), save, test again.

## Troubleshooting
| Symptom | Fix |
|---|---|
| Render build fails | Open the build log; send the last 30 lines. |
| API log: invalid env | The message names the setting (CORS must be exact https, JWT 32+ characters, e-mail must be smtp). |
| Login page loads, login says network error | `vercel.json` still has CHANGE-ME, or the Render service is asleep: open `/api/health` once and wait a minute. |
| 403 / CORS error | `CORS_ORIGINS` is not exactly the Vercel address. |
| Prisma P1001 / cannot reach database | Use the Neon string with `?sslmode=require`; wake the database by opening the Neon console. |
