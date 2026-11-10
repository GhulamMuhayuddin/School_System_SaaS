# Database architecture (Phase 2)

PostgreSQL 16 + Prisma. Schema: `apps/api/prisma/schema.prisma`. Tenancy SQL: `apps/api/prisma/sql/rls.sql`.

## Tables in Phase 2
| Group | Tables |
|---|---|
| Platform | schools, subscription_plans, subscriptions |
| Access control | permissions, roles, role_permissions |
| Users/sessions | users, refresh_tokens, password_reset_tokens, audit_logs |
| Academic core | academic_sessions, classes, sections, subjects, class_subjects |

## Phase 5A additions
students (admission_no unique per school, class_id, section_id, status, soft delete), guardians, student_guardians (relation, is_primary; unique student+guardian), school_counters (per-school sequences, e.g. next admission number). `students.user_id` (Phase 12, optional, unique) links a student to their own login (role `student`). All have school_id and need `pnpm db:rls` after the migration.

Later phases add tables (students, fees, ...) to the same schema, each with `school_id`.

## Conventions
UUID primary keys, snake_case tables/columns (Prisma `@map`), `created_at`/`updated_at`, soft delete (`deleted_at`) on schools and users, money as `Decimal(12,2)`, email globally unique, one role per user.

## Tenant isolation (multi-school)
Two independent layers:
1. **Application** (`src/db/tenant.ts`): `forSchool(prisma, schoolId)` sets `app.school_id` for every query (transaction-local) and forces `schoolId` on creates. `schoolId` is taken from the verified token, never from request input.
2. **Database** (`rls.sql`): Row Level Security with FORCE on every table that has `school_id`. The API connects as `nexora_app` (not superuser, no BYPASSRLS), so even a buggy query cannot read or write another school's rows. `rls.sql` finds tables with a `school_id` column automatically, so new tables are protected once `pnpm db:rls` is re-run after the migration.

Special cases: `schools` (a school sees only itself); `roles` (system templates with NULL school_id are readable by all, writable only through `withBypass`); `audit_logs`.
`withBypass()` (sets `app.bypass_rls`) is reserved for login, seeding and Super Admin platform operations.

## Two database roles
- `nexora` (owner): migrations, `db:rls`, seeding. Used via `DIRECT_URL` only.
- `nexora_app` (runtime): used via `DATABASE_URL` by the API.

## Setup (local)
```
docker compose up -d db
cp apps/api/.env.example apps/api/.env        # then fill SEED_* values
pnpm db:generate
pnpm db:migrate        # first run: name it "init"; COMMIT the generated prisma/migrations folder
pnpm db:rls            # re-run after EVERY migration
pnpm db:seed
pnpm dev:api           # http://localhost:4000/api/health/ready
```
Isolation test: `RUN_DB_TESTS=1 pnpm --filter @nexora/api test`.

## Role/permission matrix
Defined in `packages/shared/src/permissions.ts` (72 permissions, 13 roles). Seeded into the DB. Draft 1; finalised in Phase 3.

## Setup without Docker (native PostgreSQL, verified on Windows with PostgreSQL 18)
Install PostgreSQL, add its `bin` folder to PATH, then as the `postgres` admin user:
```
psql -U postgres -c "CREATE ROLE nexora LOGIN SUPERUSER PASSWORD 'nexora_dev_password';"
psql -U postgres -c "CREATE DATABASE nexora_school OWNER nexora;"
psql -U postgres -f docker\postgres\init.sql        # creates the restricted nexora_app role
```
Dev passwords only; use strong unique ones outside local development. `nexora` is a SUPERUSER here only because `prisma migrate dev` needs to create a shadow database; production must use a non-superuser owner and `pnpm db:deploy`.
Then copy apps/api/.env.example to apps/api/.env, fill SEED_*, and run `pnpm db:migrate`, `pnpm db:rls`, `pnpm db:seed`. Migrations are committed under apps/api/prisma/migrations, so on a fresh database `pnpm db:migrate` just applies them.

## Phase 5B additions
admission_applications (school_id, application_no unique per school, status PENDING/APPROVED/REJECTED, student and guardian details, applied class, decision fields, student_id unique once approved) and guardians.user_id (unique, optional link to a parent login). Needs `pnpm db:migrate` then `pnpm db:rls`.

## Phase 6 additions
staff (school_id, employee_no unique per school, names, gender, phone, optional email/cnic/address/date_of_birth, category TEACHING/ADMINISTRATIVE/SUPPORT, designation, qualification, joining_date, status ACTIVE/LEFT, left_at/left_reason, notes, user_id unique optional, deleted_at). Needs `pnpm db:migrate` then `pnpm db:rls`.

## Phase 7A tables
`periods` (school_id, name unique per school, start_time/end_time "HH:MM", sort_order, is_break), `teaching_assignments` (session, section, subject, staff; unique per session+section+subject), `timetable_entries` (session, section, day_of_week 1-7, period, subject, staff nullable, room; unique per session+section+day+period AND per session+staff+day+period so a teacher cannot be in two places). All carry school_id and are covered by the automatic Row Level Security policy after `pnpm db:rls`. Foreign keys cascade from the school/session/section/subject/period/staff; the application refuses deletes of things in use before the database is asked.

## Phase 7C tables
`calendar_events` (school_id, title, type enum, start_date/end_date DATE inclusive, description; index on school + start_date) and `syllabus_topics` (school, session, class, subject, title, description, sort_order, status enum, completed_at; unique per session+class+subject+title). Both carry school_id and get the automatic Row Level Security policy from `pnpm db:rls`; they cascade from school/session/class/subject, and the application refuses deleting a subject, class subject or session that still has topics.

## Phase 8A tables
`student_attendance` (school_id, student_id, date DATE, status enum, remark, class_id + section_id = snapshot without foreign keys, marked_by_id; unique per student + date; index on school + date + class + section) and `staff_attendance` (school_id, staff_id, date, status, remark, marked_by_id; unique per staff + date). Both carry school_id and get the automatic Row Level Security policy from `pnpm db:rls`; they cascade from the school and the student/staff.


## Phase 10B-3 tables
`account_categories` (school_id, kind LedgerKind INCOME/EXPENSE, name, is_active; unique per school + kind + name) and `account_entries` (school_id, entry_no unique per school, kind, category_id -> account_categories with ON DELETE RESTRICT, amount INT whole rupees, method PaymentMethod, entry_date DATE, description, party, reference, created_by_id, voided_at / void_reason / voided_by_id; indexes on school + entry_date and school + kind + category). Both carry school_id and get the automatic Row Level Security policy from `pnpm db:rls`; they cascade from the school. Entry numbers use school_counters keys `account_income_no` and `account_expense_no`. Needs `pnpm db:migrate` then `pnpm db:rls`.

## Phase 11 tables
`homework` (school_id, session_id, section_id, subject_id, title, description, assigned_date DATE, due_date DATE, max_marks INT null, created_by_id; indexes on school + section + due_date and school + due_date; cascades from school, session, section, subject) and `homework_submissions` (school_id, homework_id, student_id, status SubmissionStatus SUBMITTED/LATE/MISSING, marks INT null, remark, checked_by_id, checked_at; unique per homework + student; index on school + student; cascades from homework and student). A student without a row is "not checked yet". Both carry school_id and get the automatic Row Level Security policy from `pnpm db:rls`. Needs `pnpm db:migrate` then `pnpm db:rls`.

## Library (Phase 13A)
`library_settings` (school_id PK: loan_days, fine_per_day, max_books_student), `library_books` (title, author, isbn, category, publisher, language, location, active), `library_copies` (accession_no unique per school, status AVAILABLE/ISSUED/LOST/WITHDRAWN), `library_loans` (copy, student, issued_on, due_on, returned_on, renewals, fine_amount, fine_status NONE/UNPAID/PAID/WAIVED, issued_by_id, returned_by_id). All have school_id and need `pnpm db:rls`; accession numbers use school_counters key `library_accession`.

## Transport (Phase 13B)
`transport_vehicles` (registration_no unique per school, kind, capacity, driver_name, driver_phone, active), `transport_routes` (name unique per school, monthly_fee whole rupees, vehicle_id ON DELETE SET NULL, active), `transport_stops` (route_id CASCADE, sequence, pickup_time "HH:MM"), `transport_assignments` (student_id UNIQUE per school, route_id, stop_id ON DELETE RESTRICT, assigned_on).

## Hostel (Phase 13C)
Enum `HostelKind` (BOYS, GIRLS, MIXED). `hostels` (name unique per school, kind, warden_name, warden_phone, notes, active), `hostel_rooms` (hostel_id CASCADE, room_no unique per hostel, floor, beds, monthly_fee whole rupees per bed, active; index school + hostel), `hostel_allocations` (student_id CASCADE and UNIQUE per school = one room per student, room_id CASCADE, assigned_on DATE, assigned_by_id; index school + room). All have school_id and are covered by `pnpm db:rls` automatically. Seat/bed limits are enforced in the service under a `SELECT ... FOR UPDATE` lock on the room row, not by a database constraint.


## Phase 14A tables
leave_types, leave_requests, staff_salaries (one per staff), payroll_runs (unique school+period), payslips (unique run+staff, slip_no per school); staff_attendance.leave_request_id. Money is whole rupees.

## Phase 15A tables
inventory_items (quantity changes only through movements; unique school+code), inventory_movements (signed delta and balance after; never edited or deleted).

## Phase 15B tables
visits (check_out_at null = still inside; unique school+visit_no), complaints (status, priority, optional assigned staff and student; unique school+complaint_no), complaint_notes (timeline: NOTE, STATUS, ASSIGN).

## Phase 16A tables
announcements (audience ALL | STAFF | PARENTS | STUDENTS | CLASS with optional class_id; expires_on; withdrawn_at), announcement_reads (unique announcement+user).

## Phase 17A table
certificates (unique school+cert_no; a copy of the student's details on the issue day; voided_at / void_reason; one valid LEAVING per student enforced in the service).
