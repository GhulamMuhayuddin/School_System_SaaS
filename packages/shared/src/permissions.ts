/**
 * Single source of truth for permissions and the default role matrix.
 * Permission key format: "<module>.<action>". Backend checks keys; the frontend uses them to hide UI.
 * The default matrix below was reviewed in Phase 3A (v1). Changing it requires re-running `pnpm db:seed` (it rewrites role_permissions).
 */
export const PERMISSION_CATALOG = {
  platform: ['school.manage', 'plan.manage', 'analytics.view', 'logs.view', 'announcement.manage', 'admin.manage', 'config.manage'],
  school: ['settings.manage', 'role.manage', 'audit.view', 'session.manage'],
  student: ['read', 'create', 'update', 'delete', 'promote', 'transfer', 'withdraw', 'idcard'],
  admission: ['read', 'create', 'update', 'approve'],
  staff: ['read', 'create', 'update', 'delete', 'attendance'],
  leave: ['apply', 'approve', 'read'],
  academic: ['read', 'manage', 'timetable.manage'],
  attendance: ['read', 'mark', 'correct'],
  exam: ['read', 'manage', 'marks.enter', 'result.publish'],
  fee: ['read', 'manage', 'collect', 'report'],
  accounts: ['read', 'manage'],
  homework: ['read', 'manage', 'submit'],
  library: ['read', 'manage', 'issue'],
  transport: ['read', 'manage'],
  hostel: ['read', 'manage'],
  inventory: ['read', 'manage'],
  payroll: ['read', 'manage'],
  communication: ['read', 'send'],
  certificate: ['read', 'issue'],
  report: ['view', 'export'],
  visitor: ['read', 'manage'],
  complaint: ['read', 'manage'],
  portal: ['own.read'],
} as const;

export const PERMISSIONS: string[] = Object.entries(PERMISSION_CATALOG).flatMap(([module, actions]) =>
  actions.map((action) => `${module}.${action}`),
);

export const ROLE_KEYS = [
  'super_admin', 'school_admin', 'principal', 'vice_principal', 'accountant', 'admission_officer',
  'teacher', 'hr_manager', 'librarian', 'transport_manager', 'hostel_warden', 'store_keeper', 'receptionist', 'parent', 'student',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  super_admin: 'Super Administrator',
  school_admin: 'School Administrator',
  principal: 'Principal',
  vice_principal: 'Vice Principal',
  accountant: 'Accountant',
  admission_officer: 'Admission Officer',
  teacher: 'Teacher',
  hr_manager: 'HR Manager',
  librarian: 'Librarian',
  transport_manager: 'Transport Manager',
  hostel_warden: 'Hostel Warden',
  store_keeper: 'Store Keeper',
  receptionist: 'Receptionist',
  parent: 'Parent',
  student: 'Student',
};

const all = (module: keyof typeof PERMISSION_CATALOG): string[] => PERMISSIONS.filter((p) => p.startsWith(`${module}.`));
const pick = (module: string, ...actions: string[]): string[] => actions.map((a) => `${module}.${a}`);
const schoolScoped = PERMISSIONS.filter((p) => !p.startsWith('platform.') && !p.startsWith('portal.'));
const readOnly = schoolScoped.filter((p) => p.endsWith('.read') || p.endsWith('.view'));

export const ROLE_PERMISSIONS: Record<RoleKey, string[]> = {
  super_admin: all('platform'),
  school_admin: schoolScoped,
  principal: [...readOnly, ...pick('leave', 'approve'), ...pick('complaint', 'manage'), ...pick('certificate', 'issue'), ...pick('admission', 'approve'), ...pick('exam', 'result.publish'), ...pick('report', 'export'), ...pick('communication', 'send')],
  vice_principal: [...readOnly, ...pick('leave', 'approve'), ...pick('complaint', 'manage'), ...pick('certificate', 'issue'), ...pick('attendance', 'correct'), ...pick('academic', 'manage', 'timetable.manage'), ...pick('report', 'export'), ...pick('communication', 'send')],
  accountant: [...all('fee'), ...all('accounts'), ...pick('payroll', 'read'), ...pick('student', 'read'), ...all('report'), ...pick('communication', 'read')],
  admission_officer: [...all('admission'), ...pick('student', 'read', 'create', 'update', 'idcard'), ...pick('certificate', 'read', 'issue'), ...pick('communication', 'read')],
  teacher: [...pick('student', 'read'), ...pick('attendance', 'read', 'mark'), ...pick('exam', 'read', 'marks.enter'), ...pick('homework', 'read', 'manage'), ...pick('academic', 'read'), ...pick('communication', 'read'), ...pick('leave', 'apply')],
  hr_manager: [...all('staff'), ...all('leave'), ...all('payroll'), ...pick('report', 'view'), ...pick('communication', 'read')],
  librarian: [...all('library'), ...pick('student', 'read'), ...pick('communication', 'read')],
  transport_manager: [...all('transport'), ...pick('student', 'read'), ...pick('communication', 'read')],
  hostel_warden: [...all('hostel'), ...pick('student', 'read'), ...pick('communication', 'read')],
  store_keeper: [...all('inventory'), ...pick('communication', 'read')],
  receptionist: [...all('visitor'), ...pick('admission', 'read', 'create'), ...pick('communication', 'read'), ...pick('complaint', 'read', 'manage')],
  parent: [...pick('portal', 'own.read'), ...pick('homework', 'read'), ...pick('communication', 'read')],
  student: [...pick('portal', 'own.read'), ...pick('homework', 'read', 'submit'), ...pick('communication', 'read')],
};
