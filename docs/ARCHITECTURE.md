# Architecture
## Style
Modular monolith. REST API. One PostgreSQL database, shared schema, tenant isolation by school_id on every tenant table.
## Tenant isolation
- Every tenant table has school_id (NOT NULL, indexed, part of composite uniques).
- Prisma client extension injects school_id from the JWT into every query; services never accept school_id from the request body.
- Postgres Row Level Security as second layer (SET app.school_id per transaction).
- Super Admin is the only platform-level role (school_id NULL).
## Auth
Argon2 password hashing, 15 min access JWT, rotating refresh token in httpOnly cookie (hashed in DB, reuse detection), rate limiting, password reset via emailed one-time token.
## RBAC
Permission strings like student.read, fee.collect. Roles map to permissions per school (customizable). Middleware: authenticate -> tenant -> authorize(permission) -> validate(Zod).
## Folder structure
nexora-school-erp/
  apps/web/src/{app,components,features/<module>,hooks,i18n,lib,pages,routes,styles}
  apps/api/src/{config,middleware,modules/<module>/{routes,controller,service,schema},jobs,utils}
  apps/api/prisma/{schema.prisma,migrations,seed.ts}
  packages/shared/ (types, Zod schemas, permission constants)
  docs/  tests/e2e/
## Core entities (ER plan)
Platform: School, SubscriptionPlan, Subscription, User, Role, Permission, RolePermission, RefreshToken, AuditLog, Announcement.
Academic: AcademicSession, Class, Section, Subject, ClassSubject, Period, Timetable, Holiday, Syllabus.
People: Student, Guardian, StudentGuardian (many-to-many, multi-child parents), Admission, StudentDocument, Staff, Department, Designation, EmploymentHistory.
Attendance: StudentAttendance, StaffAttendance, LeaveRequest.
Exams: Exam, ExamSchedule, Mark, GradeScale, ResultSummary.
Finance: FeeStructure, FeeItem, Challan, ChallanItem, Payment, Discount, Fine, Expense, Income, Payroll, SalarySlip.
Learning: Homework, Submission, Resource.
Facilities: Book, BookIssue, Vehicle, Driver, Route, Stop, TransportAssignment, Hostel, Room, RoomAllocation, InventoryItem, StockMovement, Supplier, Purchase.
Comms/Ops: Notification, Visitor, Event, Complaint, Feedback, DocumentTemplate.
Conventions: UUID ids, createdAt/updatedAt, soft delete (deletedAt) where appropriate, money as Decimal, financial writes in transactions.
## Permission matrix (summary)
Super Admin: platform only (schools, plans, logs).
School Admin: all modules in own school.
Principal / Vice Principal: read all, approve leave/results, academics.
Accountant: fees, accounts, payroll view.
Admission Officer: admissions, students (create).
Teacher: own classes attendance, marks, homework, timetable.
HR Manager: staff, leave, payroll.
Librarian: library. Transport Manager: transport. Receptionist: visitors, admissions inquiry, announcements read.
Parent: own children only. Student: own data only.
(Full per-permission matrix produced in Phase 3.)
