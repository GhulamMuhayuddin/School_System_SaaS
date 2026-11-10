# API (Phase 3A)
Base path `/api`. JSON only. Every response carries an `x-request-id` header.

| Method | Path | Purpose |
|---|---|---|
| GET | /api/health | Process is up |
| GET | /api/health/ready | Database reachable (503 if not) |

## Error format
```
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {...}, "requestId": "..." } }
```
Codes: BAD_REQUEST, VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, INTERNAL_ERROR.
Middleware order: request id/logging, helmet, CORS, JSON body (1 MB), rate limit (600 / 15 min per IP, stricter auth limits come in Phase 3), routes, 404, error handler.
Adding a module: `src/modules/<name>/` with routes, controller, service, schema (zod); mount in `src/app.ts`; use `validate()` and `asyncHandler()`; access data only via `forSchool()`.

## Platform / Super Admin (Phase 4A)
All under `/api/platform`, bearer token of a platform user (no school) + permission. School users: 403.
| Method + path | Permission | Notes |
|---|---|---|
| GET /schools?q&status | platform.school.manage | list with latest subscription + user count |
| POST /schools | platform.school.manage | body: name, code (a-z0-9-, 3-40), planId, timezone?, email?, phone?, address?, city?, admin{firstName,lastName,email,password>=10}; 201; 409 duplicate code/email |
| GET/PATCH /schools/:id | platform.school.manage | detail incl. counts, admins, subscription history |
| POST /schools/:id/status | platform.school.manage | {status: ACTIVE\|SUSPENDED}; suspend revokes refresh tokens |
| PUT /schools/:id/subscription | platform.plan.manage | {planId, status, endsAt?}; closes the live one, keeps history |
| GET/POST /plans, PATCH /plans/:id | platform.plan.manage | priceMonthly >= 0, maxStudents/maxStaff null = unlimited |
| GET /analytics | platform.analytics.view | counts, subscription breakdown, new schools per month (6), logins 7d |
| GET /audit-logs?schoolId&action&limit | platform.logs.view | newest first, limit <= 500 (default 200), action is a prefix |
| GET/POST /admins, POST /admins/:id/status | platform.admin.manage | cannot deactivate yourself / the last active admin |

## School Administrator (Phase 4B)
All under `/api/school`, bearer token of a school user. The school comes from the token only.
| Method + path | Permission | Notes |
|---|---|---|
| GET /letterhead | any school member | name, address, city, phone, email of the school, for printouts |
| GET /overview | school.audit.view | counts, users by role, current session, sign-ins 7d, subscription, recent activity |
| GET/PATCH /profile | school.settings.manage | name, email, phone, address, city, timezone |
| GET /users | school.role.manage | optional q, roleId, status |
| POST /users | school.role.manage | firstName, lastName, email, phone?, roleId, password>=10; 201; 409 duplicate email; role never super_admin |
| PATCH /users/:id | school.role.manage | firstName, lastName, phone, roleId; not your own role; last school admin protected; role change ends sessions |
| POST /users/:id/status | school.role.manage | ACTIVE or INACTIVE; not yourself; last school admin protected |
| GET /audit-logs?action&userId&limit | school.audit.view | newest first, limit <= 500 (default 200) |

## Classes and students (Phase 5A)
`/api/academics`: GET /classes (academic.read); POST /classes, PATCH/DELETE /classes/:id, POST /classes/:id/sections, PATCH/DELETE /sections/:id (academic.manage; 409 when students exist).
`/api/students` (school from the token): GET /options (student.read); GET / ?q&classId&sectionId&status&limit (student.read, returns {students,total}); POST / (student.create; guardians[1..5], admissionNo optional); GET/PATCH /:id (student.read / student.update); DELETE /:id (student.delete, soft); POST /:id/withdraw {status WITHDRAWN|TRANSFERRED|GRADUATED, date, reason?} and POST /:id/reinstate (student.withdraw); POST /:id/guardians, PATCH/DELETE /:id/guardians/:linkId (student.update).

## Authentication (Phase 3A) - see docs/AUTH.md
All `/api/auth/*` responses send `Cache-Control: no-store`. Errors use the standard format above; extra codes: INVALID_CREDENTIALS (401), ACCOUNT_LOCKED (423, `details.retryAfterSeconds`), ACCOUNT_DISABLED (403), SCHOOL_SUSPENDED (403), INVALID_RESET_TOKEN (400), CURRENT_PASSWORD_INCORRECT (400), RATE_LIMITED (429).

| Method | Path | Auth | Body | Success |
|---|---|---|---|---|
| POST | /api/auth/login | none | `{ email, password, remember? }` | 200 `{ accessToken, expiresIn, user }` + `nexora_rt` cookie |
| POST | /api/auth/refresh | cookie | none | 200 same as login (rotated cookie); on failure 401 and the cookie is cleared |
| POST | /api/auth/logout | cookie | none | 204 (always) |
| POST | /api/auth/logout-all | Bearer | none | 204, every session of the user ends |
| GET | /api/auth/me | Bearer | none | 200 `{ user }` (role, school, permissions) |
| POST | /api/auth/forgot-password | none | `{ email }` | 200 `{ message }` (same for unknown emails) |
| POST | /api/auth/reset-password | none | `{ token, password }` | 204 |
| POST | /api/auth/change-password | Bearer | `{ currentPassword, newPassword }` | 204, all sessions end |
| GET | /api/roles | Bearer + `school.role.manage` + school account | none | 200 `{ roles: [{ id, key, name, isSystem, isCustom, permissions[] }] }` |
| GET | /api/permissions | same | none | 200 `{ modules }` (platform permissions excluded) |

`user` = `{ id, email, firstName, lastName, preferredLang, role: { id, key, name }, school: { id, name, code } | null, permissions: string[] }`.
CORS: the web origin must be in `CORS_ORIGINS`; the web client must send requests with `credentials: 'include'` for the cookie.


## Admissions and parent portal (Phase 5B)
`/api/admissions` (school from the token): GET / ?status&classId&limit (admission.read); POST / (admission.create); GET /:id (admission.read); PATCH /:id (admission.update, PENDING only); POST /:id/approve {classId, sectionId?, admissionDate, admissionNo?} and POST /:id/reject {note} (admission.approve; 409 if already decided; approve is one transaction that also creates the student and guardian).
`POST /api/school/guardians/:id/account` {email, password} (school.role.manage): creates a parent login for that guardian (409 if it already has one or the email exists).
`GET /api/portal/children` (portal.own.read): children linked to the caller's guardian record only.

## Teachers and staff (Phase 6)
`/api/staff` (school from the token): GET / ?q&category&status&limit (staff.read); POST / (staff.create; employeeNo optional -> E-001...); GET /:id (staff.read); PATCH /:id, POST /:id/leave {date, reason?}, POST /:id/reinstate (staff.update); DELETE /:id (staff.delete, soft; 409 while an active login exists).
`POST /api/school/staff/:id/account` {email, password, roleId} (school.role.manage): login for that staff member with the chosen role (400 for parent/student roles, 409 if one exists or the email is used).

## Phase 7A: sessions, subjects, timetable (all need a school token; school id comes from the token)
Academics (`/api/academics`): `GET/POST /sessions` (read: academic.read; write: school.session.manage), `PATCH /sessions/:id`, `POST /sessions/:id/current`, `DELETE /sessions/:id` (409 when current or when it holds assignments/lessons); `GET/POST /subjects`, `PATCH/DELETE /subjects/:id` (409 when used by assignments/lessons) (write: academic.manage); `GET/PUT /classes/:id/subjects` (PUT body `{ subjectIds: [] }` replaces the set; 409 when a removed subject is still used).
Timetable (`/api/timetable`): `GET/POST /periods`, `PATCH/DELETE /periods/:id` (body `{ name, startTime: "08:00", endTime, isBreak? }`; 409 on overlap/duplicate/in use; write: academic.timetable.manage); `GET /assignments?sessionId&staffId&sectionId`, `POST /assignments` (body `{ sectionId, subjectId, staffId, sessionId? }`, creates or changes the teacher), `DELETE /assignments/:id` (write: academic.manage); `GET /sections/:id?sessionId` and `GET /teachers/:id?sessionId` (timetable views, academic.read); `PUT /entries` (body `{ sectionId, dayOfWeek 1-7 (1 = Monday), periodId, subjectId, room?, sessionId? }`, replaces the lesson in that cell; teacher comes from the assignment; 409 when that teacher already teaches another section at that time) and `DELETE /entries/:id` (academic.timetable.manage).
`sessionId` defaults to the current session; 400 when no session is current.
Added in v0.7.1: `GET /api/timetable/teachers` (active teaching staff for pickers, `{ teachers: [{ id, name, employeeNo }] }`) and `GET /api/timetable/my?sessionId` (timetable of the staff profile linked to the signed-in login; 404 when none). Both need only academic.read.

## Phase 7C: academic calendar and syllabus (school token; school id from the token)
Calendar (`/api/calendar/events`): `GET ?from=YYYY-MM-DD&to=YYYY-MM-DD` (defaults to the current month; at most 400 days; returns events touching the range; academic.read), `POST` body `{ title, type: HOLIDAY|EVENT|EXAM|OTHER, startDate, endDate?, description? }`, `PATCH /:id`, `DELETE /:id` (academic.manage). Dates are whole days, inclusive.
Syllabus (`/api/syllabus`): `GET /topics?classId&subjectId&sessionId?` -> `{ session, classId, subject, topics[], progress { total, completed, inProgress } }`; `GET /summary?classId&sessionId?` -> per-subject progress for the class; `POST /topics` `{ classId, subjectId, title, description?, sessionId? }` (subject must be taught in the class; 409 on a duplicate title); `PATCH /topics/:id`; `POST /topics/:id/status` `{ status: PLANNED|IN_PROGRESS|COMPLETED }`; `POST /topics/:id/move` `{ direction: up|down }` (returns the renumbered list); `DELETE /topics/:id`. Reads need academic.read, every write needs academic.manage.

## Phase 8A: attendance (school token; school id and caller from the token)
Students: `GET /api/attendance/students/sections/:id?date=` (attendance.read; returns `{ date, today, section, holiday, marked, access: { canMark, reason }, students[{ id, admissionNo, name, status|null, remark|null }] }`; `reason` is FUTURE_DATE, HOLIDAY, NOT_YOUR_SECTION, PAST_DATE or NO_SESSION), `PUT /api/attendance/students/sections/:id` body `{ date, entries: [{ studentId, status: PRESENT|ABSENT|LATE|LEAVE, remark? }] }` (attendance.mark; 403 for another teacher's section or a past day without attendance.correct, 400 for a future date or bad list, 409 on a holiday; returns the roster), `GET .../sections/:id/monthly?month=YYYY-MM` (sheet: per-student `records` by date, `totals`, `holidays`), `GET /api/attendance/students/:id/history?from&to` (max 366 days), `GET /api/attendance/reports/students?from&to&classId?&sectionId?&below?&limit?` (lowest percentage first; `below` keeps students under that %; limit default 200, max 500).
Phase 8B added no endpoints; the web uses the ones above (the student page card uses `/students/:id/history`).
Staff (staff.attendance): `GET /api/attendance/staff?date=`, `PUT /api/attendance/staff` body `{ date, entries: [{ staffId, status, remark? }] }`, `GET /api/attendance/staff/monthly?month=YYYY-MM`.
Percentage = (PRESENT + LATE) / all marked days; `null` when nothing is marked. "Today" is the date in the school's own time zone.


## Phase 10B-3: accounts ledger (school token; school id and caller from the token)
`/api/accounts`: `GET /categories?kind=INCOME|EXPENSE` (accounts.read), `POST /categories` `{ kind, name }` (409 on a duplicate name of the same kind, any letter case), `POST /categories/defaults` (adds the common categories that are missing, returns `{ created }`), `PATCH /categories/:id` `{ name?, isActive? }` (write: accounts.manage).
`GET /entries?kind&categoryId&from&to&method&q&includeVoided` (accounts.read) -> `{ entries[], income, expense, truncated }`: newest first, at most 500 rows; `income` / `expense` always cover every matching entry that is not voided. `POST /entries` `{ kind, categoryId, amount (whole rupees, 1..100000000), method CASH|BANK|ONLINE, entryDate YYYY-MM-DD (not in the future), description (3-200), party?, reference? }` (accounts.manage; 400 for a category of the other kind or an inactive one, 404 for an unknown category); entry numbers INC-000001 / EXP-000001. `GET /entries/:id`; `POST /entries/:id/void` `{ reason }` (accounts.manage; 409 when already voided). Entries cannot be edited or deleted.
Reports (accounts.read): `GET /reports/summary?from&to` (default: first of this month to today) -> `{ from, to, feeIncome, otherIncome, totalIncome, expenses, net, incomeByCategory[], expenseByCategory[] }` where feeIncome = non-voided fee receipts paid in the range (from /api/fees data); `GET /reports/monthly?year=YYYY` (default: this year) -> `{ year, months[12] { month, feeIncome, otherIncome, expenses, net } }`.

## Phase 11: homework (school token; school id and caller from the token)
`/api/homework` (needs homework.read AND academic.read; writes also homework.manage): `GET /?classId&sectionId&subjectId&from&to&mine=true` -> `HomeworkItem[]` (title, class, section, subject, assignedDate, dueDate, maxMarks, state UPCOMING|DUE_TODAY|OVERDUE, counts { students, submitted, late, missing, pending }); newest due date first, at most 300. `POST /` `{ sectionId, subjectId, title (3-120), description?, assignedDate? (not in the future, default today), dueDate (on or after it, within 365 days), maxMarks? (1-1000) }` -> detail (403 when a teacher does not teach that section + subject in the current session; 400 when the subject is not offered in the class or no current session exists). `GET /:id` -> detail with `roster[] { studentId, admissionNo, name, status, marks, remark }` (active students of the section) and `access { canEdit, reason }`. `PATCH /:id` `{ title?, description?, dueDate?, maxMarks? }` (400 when the maximum would drop below saved marks). `DELETE /:id` -> 204. `PUT /:id/submissions` `{ entries: [{ studentId, status SUBMITTED|LATE|MISSING|null, marks?, remark? }] }` (null clears; marks only for SUBMITTED/LATE and need a maximum; all-or-nothing). Who may write: academic.manage any section; others only their own teaching assignments.
Parent portal: `GET /api/portal/children/:studentId/homework?from&to` (portal.own.read) -> `[{ id, title, description, subject, assignedDate, dueDate, maxMarks, state, status SUBMITTED|LATE|MISSING|PENDING, marks, remark }]`; 404 when the student is not linked to the caller.

## Parent and student portal (Phase 12)
All under `/api/portal`, permission `portal.own.read`; school and user come from the token only. A parent may open only children linked to their guardian record, a student login only itself; every other student id answers 404.
- `GET /children` -> `{ viewer: PARENT|STUDENT, guardianName, children: [{ id, admissionNo, firstName, lastName, status, class, section, relation (SELF for a student) }] }`
- `GET /children/:studentId/attendance?month=YYYY-MM` -> `{ month, student, from, to, records, totals }`
- `GET /children/:studentId/results` -> `[{ exam, class, classSize, result }]` (published exams with papers only)
- `GET /children/:studentId/fees` -> `{ vouchers, totals: { billed, paid, balance, overdueBalance } }` (cancelled vouchers hidden); `GET /children/:studentId/fees/:voucherId` -> voucher with items and payments (404 if it belongs to another student)
- `GET /children/:studentId/timetable` -> `{ timetable: SectionTimetable | null }`
- `GET /calendar?from&to` -> `{ events }` (defaults to the current month, max 400 days)
- Student login: `POST /api/school/students/:id/account { email, password }` (school.role.manage) -> 201 `{ user }`; 409 if the student already has a login or the email is used; only for an ACTIVE student.

## Library (Phase 13A)
`/api/library` (school and user from the token only). `library.read` views, `library.issue` issues/returns/renews/settles fines, `library.manage` changes the catalogue and rules. Parents, students and teachers hold none of them.
- `GET /summary` -> `{ books, copies, available, issued, overdue, unpaidFines: { count, amount } }`; `GET /settings`, `PUT /settings { loanDays 1..90, finePerDay 0..1000, maxBooksStudent 1..20 }`
- `GET /books?q&category&available&includeInactive` -> `{ books, categories, truncated }`; `POST /books { title, author, isbn?, category?, publisher?, language?, location?, copies 0..100 }` -> 201 detail; `GET /books/:id` (copies with current borrower); `PATCH /books/:id` (incl. `active`; 409 while copies are issued); `POST /books/:id/copies { count 1..100 }`; `PATCH /copies/:id { status AVAILABLE|LOST|WITHDRAWN }` (409 for an issued copy)
- `GET /loans?status=open|overdue|returned|all&studentId&q` -> `{ loans, truncated }`; `POST /loans { copyId | accessionNo, studentId, dueOn? }` -> 201 (409: copy not available, limit reached, overdue book, unpaid fine; 400: student not active, bad due date); `POST /loans/:id/return` (fine computed, 409 if already returned); `POST /loans/:id/renew` (max 2, not overdue); `POST /loans/:id/fine { action PAID|WAIVED }` (409 without an unpaid fine)
- Portal: `GET /api/portal/children/:studentId/library` -> `{ loans, unpaidFine }`.

## Transport (Phase 13B)
`/api/transport` (school and user from the token only). `transport.read` views; changing needs `transport.read` AND `transport.manage`. Details and rules: HANDOFF.md "Phase 13B".
- `GET /summary`, `GET/POST /vehicles`, `PATCH /vehicles/:id`, `GET/POST /routes`, `GET/PATCH /routes/:id`, `PUT /routes/:id/stops`, `GET /riders?routeId&q`, `GET/PUT/DELETE /students/:studentId` (PUT `{ routeId, stopId }`; 409 ROUTE_FULL / CAPACITY / STOP_IN_USE).
- Portal: `GET /api/portal/children/:studentId/transport` -> `{ assignment }`. Fees: `POST /api/fees/vouchers/generate` accepts `includeTransport`.

## Hostel (Phase 13C)
`/api/hostel` (school and user from the token only). `hostel.read` views; changing needs `hostel.read` AND `hostel.manage` (roles: school_admin, hostel_warden; the principal reads). Parents and students hold neither.
- `GET /summary` -> `{ hostels, rooms, beds, residents, freeBeds, monthlyIncome, overCapacity }`
- `GET /hostels?includeInactive`; `POST /hostels { name 2..80, kind BOYS|GIRLS|MIXED, wardenName?, wardenPhone?, notes? }` -> 201; `PATCH /hostels/:id` (incl. `active`; 409 KIND_CONFLICT when a resident would not fit the new kind; 409 while students live there when deactivating)
- `GET /rooms?hostelId&includeInactive` -> rooms with `residents`, `bedState` (FREE|FULL|OVER) and `income`; `POST /rooms { hostelId, roomNo, floor? -2..50, beds 1..40, monthlyFee? 0..1000000 }` -> 201 (409 duplicate number in the hostel); `PATCH /rooms/:id` (409 CAPACITY below the residents, 409 while students live there when deactivating)
- `GET /residents?hostelId&roomId&q` -> `{ residents, truncated }` (max 500)
- `GET /students/:studentId` -> `{ allocation | null }`; `PUT /students/:studentId { roomId }` -> allocation (409 ROOM_FULL, 409 GENDER_MISMATCH; 400 student not active or room not active; 404 unknown student/room); `DELETE /students/:studentId` -> 204 (404 when the student does not live in the hostel)
- Portal: `GET /api/portal/children/:studentId/hostel` -> `{ allocation }` (own children / own record only). Fees: `POST /api/fees/vouchers/generate` accepts `includeHostel`.

## Leave (Phase 14A) /api/leave
GET/POST /types, POST /types/defaults, PATCH /types/:id (leave.read + staff.update to change); GET/POST /requests (?status&staffId&from&to&mine), POST /requests/:id/approve | reject (leave.approve), POST /requests/:id/cancel; GET /balances (?staffId&year). leave.apply = own requests, leave.read = all, leave.approve = decide.

## Payroll (Phase 14A) /api/payroll
GET /salaries (?q&missing), PUT /salaries/:staffId; GET/POST /runs, GET/DELETE /runs/:id, POST /runs/:id/regenerate | finalize | reopen; PATCH /payslips/:id; POST /payslips/:id/pay | void-payment (payroll.read + accounts.manage); GET /my (own finalized payslips). payroll.read view, payroll.manage change.

## Inventory (Phase 15A) /api/inventory
GET /summary, GET /categories, GET/POST /items (?q&category&lowOnly&includeInactive), GET/PATCH /items/:id, POST /items/:id/stock (kind IN | OUT | ADJUST), GET /movements (?itemId&kind&from&to). inventory.read views; changing needs inventory.read + inventory.manage.

## Visitors (Phase 15B) /api/visitors
GET /summary, GET /visits (?date&inside&q), POST /visits, POST /visits/:id/checkout, PATCH /visits/:id. visitor.read views; changing needs visitor.read + visitor.manage.

## Complaints (Phase 15B) /api/complaints
GET /summary, GET / (?status&category&priority&assignedStaffId&q&active), POST /, GET/PATCH /:id, POST /:id/assign | status | notes. complaint.read views; changing needs complaint.read + complaint.manage.

## Communication (Phase 16A) /api/communication
GET /announcements (?unreadOnly), GET /unread-count, POST /announcements/:id/read, POST /announcements/read-all (communication.read); POST /announcements, GET /sent, POST /announcements/:id/withdraw (communication.read + communication.send). In-app only: no SMS or email.

## Certificates (Phase 17A) /api/certificates
GET / (?type&status&studentId&q), GET /:id (with school letterhead) (certificate.read); POST /, POST /:id/void (certificate.read + certificate.issue). Payslip printing: GET /api/payroll/payslips/:id (payroll.read), GET /api/payroll/my/:id (own finalized slip).
