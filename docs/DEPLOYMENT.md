# Deployment guide (Phase 20, v0.20.0)

**Honest status:** every file here was written and cross-checked with `node scripts/check-deploy.mjs`, but **nothing was started**: the authoring environment had no Docker, no network and no database. Your first deployment is the real test. Do it on a cheap test server first, not with a real school.

## 0. Blocker: the migrations are incomplete
`apps/api/prisma/migrations` contains only the first migration (15 tables). `schema.prisma` has 66. `prisma migrate deploy` (what the server runs) would create an incomplete database.
On **your PC** (Windows cmd, project root, Docker database running, `apps\api\.env` filled in):
```
pnpm install
pnpm db:migrate        (name e.g. phase20_all_tables; creates ONE migration for every pending table)
pnpm db:rls
pnpm db:seed
pnpm typecheck && pnpm test && pnpm build
node scripts\check-deploy.mjs     (check 1 must now pass)
```
Then keep the new folder `apps/api/prisma/migrations/...` (it is source code: commit it, include it in the ZIP). Also run the DB tests once (`set RUN_DB_TESTS=1`, then `pnpm --filter @nexora/api test`): they have never been run, and production is the wrong place to find out.

## 1. What you need
- A Linux server (Ubuntu 22.04/24.04), 2 GB RAM minimum, 20 GB disk, with Docker and the Docker Compose plugin.
- A domain name whose **A record points to the server's IP** (needed before HTTPS can be issued). Ports 80 and 443 open.
- An SMTP account for password-reset mails (your host's mail, or a transactional mail service).
- Strong secrets (see `.env.production.example`).

## 2. First deployment
```
git clone <your repo> nexora && cd nexora        # or upload the ZIP and unzip it
cp .env.production.example .env.production       # fill EVERY "CHANGE-ME"
chmod 600 .env.production
node scripts/check-deploy.mjs                    # needs Node on the server or run it on your PC before upload

C="docker compose --env-file .env.production -f docker-compose.prod.yml"
$C build                                         # first build downloads the Prisma engine: needs internet; takes minutes
$C up -d db
$C --profile tools run --rm migrate              # migrations + RLS + roles/permissions + first super admin
$C up -d
$C ps                                            # api should become "healthy"
$C logs -f api                                   # Ctrl+C to leave
```
Open `https://<your domain>` and sign in with `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD`. **Change that password immediately.** Create the first school and its admin from the platform screens.

Notes:
- `SEED_DEMO_SCHOOL` is forced to false for production. Never seed demo data on a live server.
- If the API exits at startup, `$C logs api` names the exact setting (production refuses: non-https CORS, `COOKIE_SECURE=false`, the console e-mail transport, a JWT secret under 32 characters).
- The database has no published port; only Caddy (80/443) faces the internet. Do not add a `ports:` entry to `db` or `api`.
- Caddy sends `/api/*` straight to the API and everything else to the web container. Keep it that way: the API trusts exactly **one** proxy hop (`trust proxy 1`); an extra proxy in between makes every user share one IP and the login rate limit locks everybody out together.

## 3. Go-live checks (30 minutes, do all)
1. `https://<domain>/api/health/ready` shows `{"status":"ready","database":"up"}`. `http://<domain>` redirects to https.
2. Browser dev tools -> Network -> click the page request -> Response Headers show Content-Security-Policy, Strict-Transport-Security, X-Frame-Options. Console shows **no** CSP errors while you click through Dashboard, Students, Fees, Print. (This has never been checked on a live server.)
3. Test on an online header checker (securityheaders.com) and an SSL test (ssllabs.com). Expect A-grade headers.
4. "Forgot password" for a test user: the mail really arrives and the link opens `https://<domain>/...`.
5. Sign in from two different phones/networks, fail a password 5 times on one: only that account/IP is locked, the other still works (proves TRUST_PROXY is right).
6. Run `./scripts/backup.sh`, then `./scripts/restore-test.sh backups/<file>`: it must print "Restore test OK".
7. Confirm RLS on the live database: `$C exec db psql -U nexora -d nexora_school -c "select rolname, rolsuper, rolbypassrls from pg_roles where rolname='nexora_app'"` shows `f | f`.
8. Walk through the Phase 19B list (wrong email message, create student with 2 guardians, create staff, Fees -> Reports) and the Phase 18A Urdu/phone walk-through on the real site.
9. Have the school read the certificate wording (`print.cert.*`) and approve it.
10. Run `pnpm audit` on your PC the week you go live.

## 4. Updating to a new version
```
./scripts/backup.sh                                # ALWAYS first
git pull   (or upload the new ZIP over the folder, keep .env.production and backups/)
C="docker compose --env-file .env.production -f docker-compose.prod.yml"
$C build
$C --profile tools run --rm migrate                # only needed when the release notes say "migration" or "re-seed"
$C up -d
```
Every release's CHANGELOG entry says whether it needs a migration, `db:rls` and `db:seed`. `migrate` runs all three and is safe to repeat.

## 5. Rolling back
Code only (no migration in that release): check out / unzip the previous version, `$C build`, `$C up -d`.
With a migration: restore the backup taken before the update (`./scripts/restore.sh <dump>`) **and** deploy the previous code. Migrations are not reversed automatically.

## 6. Without Docker (alternative)
Possible, using `docs/deploy/nginx-web.conf.example`: Node 20, PostgreSQL 16, `pnpm install --frozen-lockfile`, `pnpm build`, run `node apps/api/dist/server.js` under systemd/pm2 with the same environment values as the compose file, serve `apps/web/dist` with nginx, certificates with certbot. All the "must be right" rules in docs/SECURITY.md still apply. This path is documented but not tested.

## 7. Static hosting for the web only
`apps/web/public/_headers` works on Netlify / Cloudflare Pages. The API must then be on the same address under `/api`, or add its address to `connect-src` in `_headers` **and** in both nginx files (the check script compares them), and set `VITE_API_URL` at build time and `CORS_ORIGINS` on the API.
