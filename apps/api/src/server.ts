import 'dotenv/config';
import { createApp } from './app';
import { loadEnv } from './config/env';
import { createPrismaClient } from './db/prisma';
import { createAuthRuntime } from './modules/auth';
import { PlatformService } from './modules/platform/platform.service';
import { AcademicsService } from './modules/academics/academics.service';
import { AdmissionsService } from './modules/admissions/admissions.service';
import { ExamsService } from './modules/exams/exams.service';
import { AccountsService } from './modules/accounts/accounts.service';
import { FeesService } from './modules/fees/fees.service';
import { LibraryService } from './modules/library/library.service';
import { HostelService } from './modules/hostel/hostel.service';
import { CertificatesService } from './modules/certificates/certificates.service';
import { CommunicationService } from './modules/communication/communication.service';
import { ComplaintsService } from './modules/complaints/complaints.service';
import { VisitorsService } from './modules/visitors/visitors.service';
import { InventoryService } from './modules/inventory/inventory.service';
import { LeaveService } from './modules/leave/leave.service';
import { PayrollService } from './modules/payroll/payroll.service';
import { TransportService } from './modules/transport/transport.service';
import { HomeworkService } from './modules/homework/homework.service';
import { AttendanceService } from './modules/attendance/attendance.service';
import { CalendarService } from './modules/calendar/calendar.service';
import { StaffService } from './modules/staff/staff.service';
import { SyllabusService } from './modules/syllabus/syllabus.service';
import { TimetableService } from './modules/timetable/timetable.service';
import { PortalService } from './modules/portal/portal.service';
import { StudentsService } from './modules/students/students.service';
import { SchoolService } from './modules/school/school.service';
import { RolesService } from './modules/roles/roles.service';
import { createLogger } from './utils/logger';

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
const prisma = createPrismaClient();

const students = new StudentsService(prisma);
const app = createApp({
  logger,
  corsOrigins: env.CORS_ORIGINS,
  trustProxy: env.TRUST_PROXY,
  trustProxyHops: env.TRUST_PROXY_HOPS,
  auth: createAuthRuntime(env, prisma, logger),
  roles: new RolesService(prisma),
  platform: new PlatformService(prisma),
  school: new SchoolService(prisma),
  academics: new AcademicsService(prisma),
  students,
  admissions: new AdmissionsService(prisma, students),
  staff: new StaffService(prisma),
  timetable: new TimetableService(prisma),
  calendar: new CalendarService(prisma),
  syllabus: new SyllabusService(prisma),
  attendance: new AttendanceService(prisma),
  exams: new ExamsService(prisma),
  fees: new FeesService(prisma),
  accounts: new AccountsService(prisma),
  homework: new HomeworkService(prisma),
  library: new LibraryService(prisma),
  transport: new TransportService(prisma),
  hostel: new HostelService(prisma),
  leave: new LeaveService(prisma),
  inventory: new InventoryService(prisma),
  visitors: new VisitorsService(prisma),
  communication: new CommunicationService(prisma),
  certificates: new CertificatesService(prisma),
  complaints: new ComplaintsService(prisma),
  payroll: new PayrollService(prisma),
  portal: new PortalService(prisma, { attendance: new AttendanceService(prisma), exams: new ExamsService(prisma), fees: new FeesService(prisma), timetable: new TimetableService(prisma), calendar: new CalendarService(prisma), library: new LibraryService(prisma), transport: new TransportService(prisma), hostel: new HostelService(prisma) }),
  checkDatabase: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
});

const server = app.listen(env.PORT, () => logger.info(`API listening on http://localhost:${env.PORT}`));

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
