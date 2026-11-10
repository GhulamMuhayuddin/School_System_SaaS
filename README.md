# Nexora School ERP
Multi-school SaaS School Management System by Nexora Developers.

**Status:** Phase 2 (database and backend foundation) complete and verified. UI refresh (dashboard preview with sample data) added in v0.2.2. Phase 3 (authentication and RBAC): backend (3A) and web wiring (3B) are written; Phase 4A (Super Admin: schools, plans, subscriptions, analytics, audit logs, platform admins) added in v0.4.0, Phase 4B (School Admin: real dashboard, users and roles, profile, activity log) in v0.4.1, Phase 5A (students, guardians, classes and sections; needs a DB migration) in v0.5.0, Phase 5B (admissions and parent accounts; also a DB migration) in v0.5.1, Phase 6 (teachers and staff; also a DB migration) in v0.6.0; Phase 10 (fees: vouchers, payments, receipts, defaulters; DB migration needed) in v0.10.0, Phase 10B-3 (accounts ledger: income, expenses, categories, reports; DB migration needed) in v0.10.3, Phase 11 (homework and who handed it in, parent view; DB migration needed) in v0.11.0, Phase 12 (parent and student portals with student logins; DB migration needed) in v0.12.0, Phase 13A (library: books, issue desk, fines; DB migration needed) in v0.13.0; Phase 13B (transport: routes, stops, vehicles, riders; DB migration needed) in v0.13.1, Phase 13C (hostel: rooms, beds, residents; DB migration + re-seed needed) in v0.13.2, Phase 14A (HR and payroll backend: leave, salaries, payroll runs, payslips; DB migration needed) in v0.14.0 and 14B (web screens) in v0.14.1, Phase 15A (inventory: items, stock movements, Store Keeper role; DB migration + re-seed needed) in v0.15.0 and 15B (visitors log, complaints) in v0.15.1, Phase 16A (in-app announcements; DB migration + re-seed needed) in v0.16.0, Phase 17A (certificates and printable salary slips; DB migration + re-seed needed) in v0.17.0, Phase 17B (printable report cards, fee vouchers, receipts, ID cards; CSV exports; no migration) in v0.17.1; Phase 20A (deployment: Docker, HTTPS, backups, operations manual) in v0.20.0; see HANDOFF.md for the verification steps and docs/DEPLOYMENT.md to go live.

## Quick start
Requires Node 20+, pnpm 9.12.3 (`npm install -g pnpm@9.12.3` if corepack fails), and PostgreSQL 16+ (Docker OR a native install).
```
pnpm install
pnpm dev                     # web   http://localhost:5173
# backend:
docker compose up -d db                      # or use native PostgreSQL, see docs/DATABASE.md
cp apps/api/.env.example apps/api/.env       # fill SEED_* values
pnpm db:migrate && pnpm db:rls && pnpm db:seed   # migrations are committed (prisma/migrations)
pnpm dev:api                 # api   http://localhost:4000/api/health/ready
pnpm typecheck && pnpm test && pnpm build
```
See HANDOFF.md, PROJECT_STATUS.md, docs/ (ARCHITECTURE, DATABASE, API, ROADMAP).


## Authentication (Phase 3A)
See docs/AUTH.md. Set `JWT_ACCESS_SECRET` in apps/api/.env before starting the API.

## Deployment (Phase 20)
See docs/DEPLOYMENT.md and docs/OPERATIONS.md. Before deploying run `node scripts/check-deploy.mjs`.
