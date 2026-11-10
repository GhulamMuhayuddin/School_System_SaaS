# Operations manual (Phase 20, v0.20.0)
For the person who keeps the server running. Commands assume the project folder on the server and
`C="docker compose --env-file .env.production -f docker-compose.prod.yml"`.

## Daily / weekly / monthly
| When | What |
|---|---|
| Daily (automatic) | `./scripts/backup.sh` from cron: `15 2 * * * cd /opt/nexora && ./scripts/backup.sh >> backups/backup.log 2>&1` |
| Daily (automatic) | Copy `backups/` **off the server** (another machine or cloud storage), e.g. `rclone sync backups remote:nexora-backups` or `rsync`. A backup that lives only on the server dies with the server. |
| Weekly | `$C ps` (all healthy), `df -h` (disk), `tail backups/backup.log`. |
| Monthly | `./scripts/restore-test.sh backups/<latest>` must print "Restore test OK". An untested backup is a hope, not a backup. |
| Monthly | `sudo apt update && sudo apt upgrade`, reboot if asked; `$C pull db caddy && $C up -d`. Run `pnpm audit` on your PC and update dependencies if something high/critical appears. |

## Where things are
- Logs: `$C logs --tail 200 api` (JSON lines; Authorization, cookies, passwords are redacted; every error has a request id the user can quote). Caddy: `$C logs caddy`.
- Health: `https://<domain>/api/health` (process up), `/api/health/ready` (database reachable). Point a free uptime monitor (UptimeRobot, Better Stack) at `/api/health/ready` and have it e-mail you.
- Data: Docker volume `nexora_pgdata` (database), `nexora_caddy_data` (certificates). The `backups/` folder is yours.

## Common problems
| Symptom | Likely cause / fix |
|---|---|
| Site not reachable, Caddy log says certificate failed | DNS A record not pointing here yet, or ports 80/443 blocked. |
| API restarts in a loop | `$C logs api`: the message names the bad setting (see DEPLOYMENT.md section 2). |
| Everybody gets "too many requests" / locked out together | A proxy sits between Caddy and the API, or `TRUST_PROXY` is not true: all users share one IP. Remove the extra hop. |
| No reset e-mails | SMTP values wrong: look for `smtp` errors in the API log; test the account with a mail client. |
| Users cannot sign in after a role change | Role changes apply within 15 minutes (token lifetime); deactivation also cuts refresh immediately. |
| Fee voucher generation is slow for a big class | Generate class by class (documented in SECURITY.md). |
| Disk filling | `docker system df`; old images: `docker image prune`; old dumps are deleted after `KEEP_DAYS` (default 14). |

## Restoring after a disaster
New server -> follow DEPLOYMENT.md sections 1-2 up to `$C up -d db` and the migrate job, copy the latest dump into `backups/`, then `./scripts/restore.sh backups/<file>`. Expect data loss up to the age of the last off-server copy: that is why the daily copy matters.

## Secrets
Rotate `JWT_ACCESS_SECRET` if it ever leaks (everyone is signed out). Change database passwords by editing `.env.production` **and** `ALTER ROLE nexora_app PASSWORD '...'` in the database; then `$C up -d`. Never e-mail `.env.production`; never put it in a ZIP.

## Onboarding a school (checklist)
1. Platform admin: create school + plan + subscription + school admin user.
2. School admin: letterhead details (name, address, phone), academic session, classes/sections, subjects, fee heads and structure, staff and roles, students (or admissions).
3. Print one of each sheet (certificate, report card, voucher, ID card) in English and Urdu and let the school approve the wording and layout.
4. Train: attendance (teachers), fee collection (accountant), announcements (principal), portal login (parents).
5. Tell the school plainly: no SMS/WhatsApp/e-mail notifications exist yet; people see announcements when they open the app.

## Known limits (for the sales conversation, not to hide)
No SMS/WhatsApp/push delivery, no online payment, no online homework submission, no analytics dashboard (Phase 17), no two-factor login, no student photos or QR codes on ID cards, no load test on real data. See docs/SECURITY.md and CHANGELOG.
