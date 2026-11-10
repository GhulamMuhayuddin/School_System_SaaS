import { Suspense, lazy } from 'react';
import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/components/layout/app-layout';
import { Spinner } from '@/components/ui/states';
import { PublicOnly, RequireAnyPermission, RequireAuth, RequirePermission } from '@/features/auth/guards';

const LoginPage = lazy(() => import('@/pages/login'));
const ForgotPasswordPage = lazy(() => import('@/pages/forgot-password'));
const ResetPasswordPage = lazy(() => import('@/pages/reset-password'));
const HomePage = lazy(() => import('@/pages/home'));
const SchoolProfilePage = lazy(() => import('@/pages/school-profile'));
const SchoolUsersPage = lazy(() => import('@/pages/school-users'));
const SchoolLogsPage = lazy(() => import('@/pages/school-logs'));
const StudentsListPage = lazy(() => import('@/pages/students-list'));
const StudentNewPage = lazy(() => import('@/pages/student-new'));
const StudentDetailPage = lazy(() => import('@/pages/student-detail'));
const StaffListPage = lazy(() => import('@/pages/staff-list'));
const StaffNewPage = lazy(() => import('@/pages/staff-new'));
const StaffDetailPage = lazy(() => import('@/pages/staff-detail'));
const AdmissionsListPage = lazy(() => import('@/pages/admissions-list'));
const AdmissionNewPage = lazy(() => import('@/pages/admission-new'));
const AdmissionDetailPage = lazy(() => import('@/pages/admission-detail'));
const ClassesPage = lazy(() => import('@/pages/classes'));
const AcademicSetupPage = lazy(() => import('@/pages/academic-setup'));
const TeachingAssignmentsPage = lazy(() => import('@/pages/teaching-assignments'));
const TimetablePage = lazy(() => import('@/pages/timetable'));
const AcademicCalendarPage = lazy(() => import('@/pages/academic-calendar'));
const ExamsListPage = lazy(() => import('@/pages/exams-list'));
const ExamDetailPage = lazy(() => import('@/pages/exam-detail'));
const ExamMarksPage = lazy(() => import('@/pages/exam-marks'));
const ExamResultsPage = lazy(() => import('@/pages/exam-results'));
const ExamGradesPage = lazy(() => import('@/pages/exam-grades'));
const FeesVouchersPage = lazy(() => import('@/pages/fees-vouchers'));
const FeesSetupPage = lazy(() => import('@/pages/fees-setup'));
const FeesReportsPage = lazy(() => import('@/pages/fees-reports'));
const PortalChildPage = lazy(() => import('@/pages/portal-child'));
const LibraryPage = lazy(() => import('@/pages/library'));
const TransportPage = lazy(() => import('@/pages/transport'));
const HostelPage = lazy(() => import('@/pages/hostel'));
const CertificatesPage = lazy(() => import('@/pages/certificates'));
const CertificatePrintPage = lazy(() => import('@/pages/certificate-print'));
const ReportCardsPrintPage = lazy(() => import('@/pages/report-cards-print'));
const IdCardsPrintPage = lazy(() => import('@/pages/id-cards-print'));
const FeePrint = {
  Voucher: lazy(() => import('@/pages/fee-print').then((m) => ({ default: m.VoucherPrintPage }))),
  Bulk: lazy(() => import('@/pages/fee-print').then((m) => ({ default: m.VouchersBulkPrintPage }))),
  Receipt: lazy(() => import('@/pages/fee-print').then((m) => ({ default: m.ReceiptPrintPage }))),
};
const PayslipPrintPage = lazy(() => import('@/pages/payslip-print'));
const CommunicationPage = lazy(() => import('@/pages/communication'));
const VisitorsPage = lazy(() => import('@/pages/visitors'));
const ComplaintsPage = lazy(() => import('@/pages/complaints'));
const InventoryPage = lazy(() => import('@/pages/inventory'));
const LeavePage = lazy(() => import('@/pages/leave'));
const PayrollPage = lazy(() => import('@/pages/payroll'));
const MyPayslipsPage = lazy(() => import('@/pages/my-payslips'));
const HomeworkListPage = lazy(() => import('@/pages/homework-list'));
const HomeworkDetailPage = lazy(() => import('@/pages/homework-detail'));
const AccountsLedgerPage = lazy(() => import('@/pages/accounts-ledger'));
const AccountsCategoriesPage = lazy(() => import('@/pages/accounts-categories'));
const AccountsReportsPage = lazy(() => import('@/pages/accounts-reports'));
const AttendanceMarkPage = lazy(() => import('@/pages/attendance-mark'));
const AttendanceMonthlyPage = lazy(() => import('@/pages/attendance-monthly'));
const AttendanceReportPage = lazy(() => import('@/pages/attendance-report'));
const StaffAttendancePage = lazy(() => import('@/pages/staff-attendance'));
const SyllabusPage = lazy(() => import('@/pages/syllabus'));
const PlatformSchoolsPage = lazy(() => import('@/pages/platform-schools'));
const PlatformSchoolDetailPage = lazy(() => import('@/pages/platform-school-detail'));
const PlatformPlansPage = lazy(() => import('@/pages/platform-plans'));
const PlatformLogsPage = lazy(() => import('@/pages/platform-logs'));
const PlatformAdminsPage = lazy(() => import('@/pages/platform-admins'));
const DesignSystemPage = lazy(() => import('@/pages/design-system'));
const NotFoundPage = lazy(() => import('@/pages/not-found'));

function Lazy() {
  return (
    <Suspense fallback={<Spinner />}>
      <Outlet />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    element: <Lazy />,
    children: [
      { path: '/', element: <Navigate to="/app" replace /> },
      {
        // Signed-in users are sent to the app; signed-out visitors see these pages.
        element: <PublicOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      {
        // Everything under /app needs a signed-in user. Pages that need a specific permission wrap themselves in <RequirePermission>.
        element: <RequireAuth />,
        children: [
          {
            path: '/app',
            element: <AppLayout />,
            children: [
              { index: true, element: <HomePage /> },
              { path: 'portal/:studentId/:tab?', element: <RequirePermission permission="portal.own.read"><PortalChildPage /></RequirePermission> },
              { path: 'students', element: <RequirePermission permission="student.read"><StudentsListPage /></RequirePermission> },
              { path: 'students/id-cards', element: <RequirePermission permission="student.read"><IdCardsPrintPage /></RequirePermission> },
              { path: 'students/new', element: <RequirePermission permission="student.create"><StudentNewPage /></RequirePermission> },
              { path: 'students/:id', element: <RequirePermission permission="student.read"><StudentDetailPage /></RequirePermission> },
              { path: 'staff', element: <RequirePermission permission="staff.read"><StaffListPage /></RequirePermission> },
              { path: 'staff/new', element: <RequirePermission permission="staff.create"><StaffNewPage /></RequirePermission> },
              { path: 'staff/:id', element: <RequirePermission permission="staff.read"><StaffDetailPage /></RequirePermission> },
              { path: 'admissions', element: <RequirePermission permission="admission.read"><AdmissionsListPage /></RequirePermission> },
              { path: 'admissions/new', element: <RequirePermission permission="admission.create"><AdmissionNewPage /></RequirePermission> },
              { path: 'admissions/:id', element: <RequirePermission permission="admission.read"><AdmissionDetailPage /></RequirePermission> },
              { path: 'academics/classes', element: <RequirePermission permission="academic.read"><ClassesPage /></RequirePermission> },
              { path: 'academics/setup', element: <RequirePermission permission="academic.read"><AcademicSetupPage /></RequirePermission> },
              { path: 'academics/assignments', element: <RequirePermission permission="academic.read"><TeachingAssignmentsPage /></RequirePermission> },
              { path: 'academics/timetable', element: <RequirePermission permission="academic.read"><TimetablePage /></RequirePermission> },
              { path: 'academics/calendar', element: <RequirePermission permission="academic.read"><AcademicCalendarPage /></RequirePermission> },
              { path: 'attendance', element: <RequirePermission permission="attendance.read"><AttendanceMarkPage /></RequirePermission> },
              { path: 'attendance/monthly', element: <RequirePermission permission="attendance.read"><AttendanceMonthlyPage /></RequirePermission> },
              { path: 'attendance/report', element: <RequirePermission permission="attendance.read"><AttendanceReportPage /></RequirePermission> },
              { path: 'attendance/staff', element: <RequirePermission permission="staff.attendance"><StaffAttendancePage /></RequirePermission> },
              { path: 'exams', element: <RequirePermission permission="exam.read"><ExamsListPage /></RequirePermission> },
              { path: 'exams/grades', element: <RequirePermission permission="exam.read"><ExamGradesPage /></RequirePermission> },
              { path: 'exams/papers/:id', element: <RequirePermission permission="exam.read"><ExamMarksPage /></RequirePermission> },
              { path: 'exams/:id', element: <RequirePermission permission="exam.read"><ExamDetailPage /></RequirePermission> },
              { path: 'exams/:id/report-cards', element: <RequirePermission permission="exam.read"><ReportCardsPrintPage /></RequirePermission> },
              { path: 'exams/:id/results', element: <RequirePermission permission="exam.read"><ExamResultsPage /></RequirePermission> },
              { path: 'fees', element: <RequirePermission permission="fee.read"><FeesVouchersPage /></RequirePermission> },
              { path: 'fees/vouchers/print', element: <RequirePermission permission="fee.read"><FeePrint.Bulk /></RequirePermission> },
              { path: 'fees/vouchers/:id/print', element: <RequirePermission permission="fee.read"><FeePrint.Voucher /></RequirePermission> },
              { path: 'fees/payments/:id/receipt', element: <RequirePermission permission="fee.read"><FeePrint.Receipt /></RequirePermission> },
              { path: 'fees/setup', element: <RequirePermission permission="fee.read"><FeesSetupPage /></RequirePermission> },
              { path: 'fees/reports', element: <RequirePermission permission="fee.report"><FeesReportsPage /></RequirePermission> },
              { path: 'library', element: <RequirePermission permission="library.read"><LibraryPage /></RequirePermission> },
              { path: 'transport', element: <RequirePermission permission="transport.read"><TransportPage /></RequirePermission> },
              { path: 'certificates', element: <RequirePermission permission="certificate.read"><CertificatesPage /></RequirePermission> },
              { path: 'certificates/:id/print', element: <RequirePermission permission="certificate.read"><CertificatePrintPage /></RequirePermission> },
              { path: 'payslips/:id/print', element: <PayslipPrintPage /> },
              { path: 'communication', element: <RequirePermission permission="communication.read"><CommunicationPage /></RequirePermission> },
              { path: 'visitors', element: <RequirePermission permission="visitor.read"><VisitorsPage /></RequirePermission> },
              { path: 'complaints', element: <RequirePermission permission="complaint.read"><ComplaintsPage /></RequirePermission> },
              { path: 'inventory', element: <RequirePermission permission="inventory.read"><InventoryPage /></RequirePermission> },
              { path: 'leave', element: <RequireAnyPermission anyOf={['leave.apply', 'leave.read', 'leave.approve']}><LeavePage /></RequireAnyPermission> },
              { path: 'payroll', element: <RequirePermission permission="payroll.read"><PayrollPage /></RequirePermission> },
              { path: 'my-payslips', element: <MyPayslipsPage /> },
              { path: 'hostel', element: <RequirePermission permission="hostel.read"><HostelPage /></RequirePermission> },
              { path: 'homework', element: <RequirePermission permission="academic.read"><RequirePermission permission="homework.read"><HomeworkListPage /></RequirePermission></RequirePermission> },
              { path: 'homework/:id', element: <RequirePermission permission="academic.read"><RequirePermission permission="homework.read"><HomeworkDetailPage /></RequirePermission></RequirePermission> },
              { path: 'accounts', element: <RequirePermission permission="accounts.read"><AccountsLedgerPage /></RequirePermission> },
              { path: 'accounts/categories', element: <RequirePermission permission="accounts.read"><AccountsCategoriesPage /></RequirePermission> },
              { path: 'accounts/reports', element: <RequirePermission permission="accounts.read"><AccountsReportsPage /></RequirePermission> },
              { path: 'academics/syllabus', element: <RequirePermission permission="academic.read"><SyllabusPage /></RequirePermission> },
              { path: 'school/profile', element: <RequirePermission permission="school.settings.manage"><SchoolProfilePage /></RequirePermission> },
              { path: 'school/users', element: <RequirePermission permission="school.role.manage"><SchoolUsersPage /></RequirePermission> },
              { path: 'school/logs', element: <RequirePermission permission="school.audit.view"><SchoolLogsPage /></RequirePermission> },
              { path: 'platform/schools', element: <RequirePermission permission="platform.school.manage"><PlatformSchoolsPage /></RequirePermission> },
              { path: 'platform/schools/:id', element: <RequirePermission permission="platform.school.manage"><PlatformSchoolDetailPage /></RequirePermission> },
              { path: 'platform/plans', element: <RequirePermission permission="platform.plan.manage"><PlatformPlansPage /></RequirePermission> },
              { path: 'platform/logs', element: <RequirePermission permission="platform.logs.view"><PlatformLogsPage /></RequirePermission> },
              { path: 'platform/admins', element: <RequirePermission permission="platform.admin.manage"><PlatformAdminsPage /></RequirePermission> },
              { path: 'design-system', element: <RequirePermission permission="school.settings.manage"><DesignSystemPage /></RequirePermission> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
