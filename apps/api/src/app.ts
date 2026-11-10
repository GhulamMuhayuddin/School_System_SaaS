import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import type { Logger } from 'pino';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler';
import { authRouter } from './modules/auth/auth.routes';
import type { AuthRuntime } from './modules/auth/auth.types';
import { healthRouter } from './modules/health/health.routes';
import { academicsRouter } from './modules/academics/academics.routes';
import type { AcademicsApi } from './modules/academics/academics.types';
import { studentsRouter } from './modules/students/students.routes';
import type { StudentsApi } from './modules/students/students.types';
import { admissionsRouter } from './modules/admissions/admissions.routes';
import type { AdmissionsApi } from './modules/admissions/admissions.types';
import { attendanceRouter } from './modules/attendance/attendance.routes';
import type { AttendanceApi } from './modules/attendance/attendance.types';
import { examsRouter } from './modules/exams/exams.routes';
import type { ExamsApi } from './modules/exams/exams.types';
import { accountsRouter } from './modules/accounts/accounts.routes';
import type { AccountsApi } from './modules/accounts/accounts.types';
import { feesRouter } from './modules/fees/fees.routes';
import { libraryRouter } from './modules/library/library.routes';
import type { LibraryApi } from './modules/library/library.types';
import { hostelRouter } from './modules/hostel/hostel.routes';
import type { HostelApi } from './modules/hostel/hostel.types';
import { certificatesRouter } from './modules/certificates/certificates.routes';
import type { CertificatesApi } from './modules/certificates/certificates.types';
import { communicationRouter } from './modules/communication/communication.routes';
import type { CommunicationApi } from './modules/communication/communication.types';
import { complaintsRouter } from './modules/complaints/complaints.routes';
import type { ComplaintsApi } from './modules/complaints/complaints.types';
import { visitorsRouter } from './modules/visitors/visitors.routes';
import type { VisitorsApi } from './modules/visitors/visitors.types';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import type { InventoryApi } from './modules/inventory/inventory.types';
import { leaveRouter } from './modules/leave/leave.routes';
import type { LeaveApi } from './modules/leave/leave.types';
import { payrollRouter } from './modules/payroll/payroll.routes';
import type { PayrollApi } from './modules/payroll/payroll.types';
import { transportRouter } from './modules/transport/transport.routes';
import type { TransportApi } from './modules/transport/transport.types';
import { homeworkRouter } from './modules/homework/homework.routes';
import type { HomeworkApi } from './modules/homework/homework.types';
import type { FeesApi } from './modules/fees/fees.types';
import { calendarRouter } from './modules/calendar/calendar.routes';
import type { CalendarApi } from './modules/calendar/calendar.types';
import { staffRouter } from './modules/staff/staff.routes';
import { syllabusRouter } from './modules/syllabus/syllabus.routes';
import type { SyllabusApi } from './modules/syllabus/syllabus.types';
import { timetableRouter } from './modules/timetable/timetable.routes';
import type { TimetableApi } from './modules/timetable/timetable.types';
import type { StaffApi } from './modules/staff/staff.types';
import { portalRouter } from './modules/portal/portal.routes';
import type { PortalApi } from './modules/portal/portal.service';
import { schoolRouter } from './modules/school/school.routes';
import type { SchoolApi } from './modules/school/school.types';
import { platformRouter } from './modules/platform/platform.routes';
import type { PlatformApi } from './modules/platform/platform.types';
import { rolesRouter } from './modules/roles/roles.routes';
import type { RolesApi } from './modules/roles/roles.service';

export interface AppDeps {
  logger: Logger;
  corsOrigins: string[];
  trustProxy?: boolean;
  trustProxyHops?: number;
  checkDatabase: () => Promise<void>;
  /** Authentication + RBAC. Optional so lightweight tests can build the app without it. */
  auth?: AuthRuntime;
  roles?: RolesApi;
  /** Super Administrator API (/api/platform). Needs `auth`. */
  platform?: PlatformApi;
  /** School Administrator API (/api/school): the signed-in user's own school. Needs `auth`. */
  school?: SchoolApi;
  /** Classes and sections (/api/academics). Needs `auth`. */
  academics?: AcademicsApi;
  /** Students and guardians (/api/students). Needs `auth`. */
  students?: StudentsApi;
  /** Admission applications (/api/admissions). Needs `auth`. */
  admissions?: AdmissionsApi;
  /** Teachers and staff (/api/staff). Needs `auth`. */
  staff?: StaffApi;
  /** Periods, teacher assignments and timetable (/api/timetable). Needs `auth`. */
  timetable?: TimetableApi;
  /** Academic calendar (/api/calendar) and syllabus (/api/syllabus). Need `auth`. */
  calendar?: CalendarApi;
  syllabus?: SyllabusApi;
  /** Student and staff attendance (/api/attendance). Needs `auth`. */
  attendance?: AttendanceApi;
  /** Examinations, marks and results (/api/exams). Needs `auth`. */
  exams?: ExamsApi;
  /** Fees: heads, structure, vouchers, payments, reports (/api/fees). Needs `auth`. */
  fees?: FeesApi;
  /** Accounts ledger: income, expenses, categories, reports (/api/accounts). Needs `auth`. */
  accounts?: AccountsApi;
  /** Homework and submissions (/api/homework). Needs `auth`. */
  homework?: HomeworkApi;
  /** Library (/api/library). Needs `auth`. */
  library?: LibraryApi;
  /** Transport: routes, stops, vehicles, riders (/api/transport). Needs `auth`. */
  transport?: TransportApi;
  /** Hostel: hostels, rooms with beds, residents (/api/hostel). Needs `auth`. */
  hostel?: HostelApi;
  /** Leave: types, requests, approval, balances (/api/leave). Needs `auth`. */
  leave?: LeaveApi;
  /** Inventory: items, stock movements (/api/inventory). Needs `auth`. */
  inventory?: InventoryApi;
  /** Visitors log (/api/visitors). Needs `auth`. */
  visitors?: VisitorsApi;
  /** Announcements (/api/communication). Needs `auth`. */
  communication?: CommunicationApi;
  /** Certificate register (/api/certificates). Needs `auth`. */
  certificates?: CertificatesApi;
  /** Complaints (/api/complaints). Needs `auth`. */
  complaints?: ComplaintsApi;
  /** Payroll: salaries, monthly runs, payslips (/api/payroll). Needs `auth`. */
  payroll?: PayrollApi;
  /** Parent portal (/api/portal). Needs `auth`. */
  portal?: PortalApi;
}

/** Builds the Express app. All dependencies are injected so tests can run without a database. */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  if (deps.trustProxy) app.set('trust proxy', deps.trustProxyHops ?? 1);

  app.use(
    pinoHttp({
      logger: deps.logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
    }),
  );
  app.use(helmet());
  // School data (names, marks, fees) must never sit in a browser or proxy cache, least of all on a shared school computer.
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use(cors({ origin: deps.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false }));

  app.use('/api/health', healthRouter(deps.checkDatabase));
  if (deps.auth) {
    app.use('/api/auth', authRouter(deps.auth));
    if (deps.roles) app.use('/api', rolesRouter(deps.auth, deps.roles));
    if (deps.platform) app.use('/api/platform', platformRouter(deps.auth, deps.platform));
    if (deps.school) app.use('/api/school', schoolRouter(deps.auth, deps.school));
    if (deps.academics) app.use('/api/academics', academicsRouter(deps.auth, deps.academics));
    if (deps.students) app.use('/api/students', studentsRouter(deps.auth, deps.students));
    if (deps.admissions) app.use('/api/admissions', admissionsRouter(deps.auth, deps.admissions));
    if (deps.staff) app.use('/api/staff', staffRouter(deps.auth, deps.staff));
    if (deps.timetable) app.use('/api/timetable', timetableRouter(deps.auth, deps.timetable));
    if (deps.calendar) app.use('/api/calendar', calendarRouter(deps.auth, deps.calendar));
    if (deps.syllabus) app.use('/api/syllabus', syllabusRouter(deps.auth, deps.syllabus));
    if (deps.attendance) app.use('/api/attendance', attendanceRouter(deps.auth, deps.attendance));
    if (deps.exams) app.use('/api/exams', examsRouter(deps.auth, deps.exams));
    if (deps.fees) app.use('/api/fees', feesRouter(deps.auth, deps.fees));
    if (deps.accounts) app.use('/api/accounts', accountsRouter(deps.auth, deps.accounts));
    if (deps.homework) app.use('/api/homework', homeworkRouter(deps.auth, deps.homework));
    if (deps.library) app.use('/api/library', libraryRouter(deps.auth, deps.library));
    if (deps.transport) app.use('/api/transport', transportRouter(deps.auth, deps.transport));
    if (deps.hostel) app.use('/api/hostel', hostelRouter(deps.auth, deps.hostel));
    if (deps.certificates) app.use('/api/certificates', certificatesRouter(deps.auth, deps.certificates));
    if (deps.communication) app.use('/api/communication', communicationRouter(deps.auth, deps.communication));
    if (deps.visitors) app.use('/api/visitors', visitorsRouter(deps.auth, deps.visitors));
    if (deps.complaints) app.use('/api/complaints', complaintsRouter(deps.auth, deps.complaints));
    if (deps.inventory) app.use('/api/inventory', inventoryRouter(deps.auth, deps.inventory));
    if (deps.leave) app.use('/api/leave', leaveRouter(deps.auth, deps.leave));
    if (deps.payroll) app.use('/api/payroll', payrollRouter(deps.auth, deps.payroll));
    if (deps.portal) app.use('/api/portal', portalRouter(deps.auth, deps.portal));
  }
  // Feature routers (schools, students, ...) are mounted here as each phase adds them.

  app.use(notFoundHandler);
  app.use(createErrorHandler(deps.logger));
  return app;
}
