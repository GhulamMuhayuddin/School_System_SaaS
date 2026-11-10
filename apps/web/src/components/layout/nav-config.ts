import {
  Award, BarChart3, Banknote, DoorOpen, MessageSquareWarning, BedDouble, BookMarked, BookOpen, Briefcase, Building2, Bus, CalendarCheck, CalendarOff, Receipt, CalendarClock, CalendarDays, ClipboardList, CreditCard, FileCheck2, GraduationCap, Layers, Library, ScrollText, ShieldCheck, UserCheck, UserCog,
  LayoutDashboard, MessageSquare, Package, Palette, Settings, Users, Wallet, type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  key: string;
  path: string;
  icon: LucideIcon;
  labelKey: string;
  /** Hidden from users who do not hold this permission. Omit = every signed-in user. */
  permission?: string;
  /** Alternative to `permission`: shown to users who hold AT LEAST ONE of these. */
  anyOf?: string[];
}

export interface UpcomingModule {
  key: string;
  icon: LucideIcon;
  labelKey: string;
  /** Same rule as NavItem.permission: the page is not built yet, but only relevant roles see the "Soon" entry. */
  permission: string;
}

/**
 * Only routes that really exist are listed here (they are real links). Each new module adds its
 * entry in the phase that builds it, so the sidebar never contains a link that goes nowhere.
 */
export const navItems: NavItem[] = [
  { key: 'dashboard', path: '/app', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { key: 'students', path: '/app/students', icon: Users, labelKey: 'nav.students', permission: 'student.read' },
  { key: 'admissions', path: '/app/admissions', icon: ClipboardList, labelKey: 'nav.admissions', permission: 'admission.read' },
  { key: 'staff', path: '/app/staff', icon: GraduationCap, labelKey: 'nav.staff', permission: 'staff.read' },
  { key: 'classes', path: '/app/academics/classes', icon: BookOpen, labelKey: 'nav.classes', permission: 'academic.read' },
  { key: 'academic-setup', path: '/app/academics/setup', icon: Layers, labelKey: 'nav.academicSetup', permission: 'academic.read' },
  { key: 'assignments', path: '/app/academics/assignments', icon: UserCheck, labelKey: 'nav.assignments', permission: 'academic.read' },
  { key: 'timetable', path: '/app/academics/timetable', icon: CalendarClock, labelKey: 'nav.timetable', permission: 'academic.read' },
  { key: 'attendance', path: '/app/attendance', icon: CalendarCheck, labelKey: 'nav.attendance', permission: 'attendance.read' },
  { key: 'exams', path: '/app/exams', icon: FileCheck2, labelKey: 'nav.examinations', permission: 'exam.read' },
  { key: 'fees', path: '/app/fees', icon: Wallet, labelKey: 'nav.fees', permission: 'fee.read' },
  { key: 'library', path: '/app/library', icon: Library, labelKey: 'nav.library', permission: 'library.read' },
  { key: 'transport', path: '/app/transport', icon: Bus, labelKey: 'nav.transport', permission: 'transport.read' },
  { key: 'hostel', path: '/app/hostel', icon: BedDouble, labelKey: 'nav.hostel', permission: 'hostel.read' },
  { key: 'leave', path: '/app/leave', icon: CalendarOff, labelKey: 'nav.leave', anyOf: ['leave.apply', 'leave.read', 'leave.approve'] },
  { key: 'payroll', path: '/app/payroll', icon: Briefcase, labelKey: 'nav.payroll', permission: 'payroll.read' },
  { key: 'my-payslips', path: '/app/my-payslips', icon: Receipt, labelKey: 'nav.myPayslips', permission: 'leave.apply' },
  { key: 'inventory', path: '/app/inventory', icon: Package, labelKey: 'nav.inventory', permission: 'inventory.read' },
  { key: 'visitors', path: '/app/visitors', icon: DoorOpen, labelKey: 'nav.visitors', permission: 'visitor.read' },
  { key: 'complaints', path: '/app/complaints', icon: MessageSquareWarning, labelKey: 'nav.complaints', permission: 'complaint.read' },
  { key: 'communication', path: '/app/communication', icon: MessageSquare, labelKey: 'nav.communication', permission: 'communication.read' },
  { key: 'certificates', path: '/app/certificates', icon: Award, labelKey: 'nav.certificates', permission: 'certificate.read' },
  { key: 'homework', path: '/app/homework', icon: BookMarked, labelKey: 'nav.homework', permission: 'academic.read' },
  { key: 'accounts', path: '/app/accounts', icon: Banknote, labelKey: 'nav.accounts', permission: 'accounts.read' },
  { key: 'calendar', path: '/app/academics/calendar', icon: CalendarDays, labelKey: 'nav.calendar', permission: 'academic.read' },
  { key: 'syllabus', path: '/app/academics/syllabus', icon: BookMarked, labelKey: 'nav.syllabus', permission: 'academic.read' },
  { key: 'school-users', path: '/app/school/users', icon: UserCog, labelKey: 'nav.schoolUsers', permission: 'school.role.manage' },
  { key: 'school-profile', path: '/app/school/profile', icon: Building2, labelKey: 'nav.schoolProfile', permission: 'school.settings.manage' },
  { key: 'school-logs', path: '/app/school/logs', icon: ScrollText, labelKey: 'nav.schoolLogs', permission: 'school.audit.view' },
  { key: 'platform-schools', path: '/app/platform/schools', icon: Building2, labelKey: 'nav.platformSchools', permission: 'platform.school.manage' },
  { key: 'platform-plans', path: '/app/platform/plans', icon: CreditCard, labelKey: 'nav.platformPlans', permission: 'platform.plan.manage' },
  { key: 'platform-logs', path: '/app/platform/logs', icon: ScrollText, labelKey: 'nav.platformLogs', permission: 'platform.logs.view' },
  { key: 'platform-admins', path: '/app/platform/admins', icon: ShieldCheck, labelKey: 'nav.platformAdmins', permission: 'platform.admin.manage' },
  { key: 'design-system', path: '/app/design-system', icon: Palette, labelKey: 'nav.designSystem', permission: 'school.settings.manage' },
];

/**
 * Modules planned in the roadmap whose pages do not exist yet. The sidebar shows them greyed out
 * with a "Soon" tag and NOT as links. When a module is built, MOVE its entry into navItems above.
 */
export const upcomingModules: UpcomingModule[] = [
  { key: 'reports', permission: 'report.view', icon: BarChart3, labelKey: 'nav.reports' },
  { key: 'settings', permission: 'school.settings.manage', icon: Settings, labelKey: 'nav.settings' },
];
