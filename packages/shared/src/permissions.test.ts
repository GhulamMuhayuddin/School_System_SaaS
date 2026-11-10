import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLE_KEYS, ROLE_PERMISSIONS } from './permissions';

describe('permission catalog', () => {
  it('has unique permission keys', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });
  it('every role has a permission list and only uses known keys', () => {
    for (const role of ROLE_KEYS) {
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
      for (const key of ROLE_PERMISSIONS[role]) expect(PERMISSIONS).toContain(key);
    }
  });
  it('only super_admin gets platform permissions', () => {
    for (const role of ROLE_KEYS.filter((r) => r !== 'super_admin')) {
      expect(ROLE_PERMISSIONS[role].some((p) => p.startsWith('platform.'))).toBe(false);
    }
  });
});

describe('role matrix review (Phase 3A)', () => {
  const has = (role: (typeof ROLE_KEYS)[number], key: string) => ROLE_PERMISSIONS[role].includes(key);

  it('school administrator holds every school permission, including role management', () => {
    expect(has('school_admin', 'school.role.manage')).toBe(true);
    expect(has('school_admin', 'fee.collect')).toBe(true);
    expect(has('school_admin', 'platform.school.manage')).toBe(false);
  });
  it('only the platform administrator can manage schools, and it holds no school-level permissions', () => {
    expect(has('super_admin', 'platform.school.manage')).toBe(true);
    expect(ROLE_PERMISSIONS.super_admin.every((p) => p.startsWith('platform.'))).toBe(true);
  });
  it('only the school administrator can manage roles', () => {
    for (const role of ROLE_KEYS.filter((r) => r !== 'school_admin')) expect(has(role, 'school.role.manage')).toBe(false);
  });
  it('teachers cannot touch fees, payroll or the library, and cannot submit homework as a student', () => {
    for (const key of ['fee.collect', 'fee.manage', 'payroll.read', 'library.manage', 'homework.submit']) expect(has('teacher', key)).toBe(false);
    expect(has('teacher', 'attendance.mark')).toBe(true);
    expect(has('teacher', 'homework.manage')).toBe(true);
  });
  it('accountants collect fees but cannot change students or mark attendance', () => {
    expect(has('accountant', 'fee.collect')).toBe(true);
    for (const key of ['student.update', 'student.delete', 'attendance.mark']) expect(has('accountant', key)).toBe(false);
  });
  it('parents and students get portal and communication access only, never staff or finance data', () => {
    for (const role of ['parent', 'student'] as const) {
      expect(has(role, 'portal.own.read')).toBe(true);
      for (const key of ['student.read', 'fee.read', 'staff.read', 'payroll.read', 'exam.marks.enter']) expect(has(role, key)).toBe(false);
    }
    expect(has('student', 'homework.submit')).toBe(true);
    expect(has('parent', 'homework.submit')).toBe(false);
  });
  it('only HR roles can read payroll besides the accountant and school administrator', () => {
    const allowed = new Set(['school_admin', 'accountant', 'hr_manager', 'principal', 'vice_principal']);
    for (const role of ROLE_KEYS) if (has(role, 'payroll.read')) expect(allowed.has(role)).toBe(true);
  });
});


describe('academic management matrix (Phase 7A)', () => {
  const has = (role: (typeof ROLE_KEYS)[number], key: string) => ROLE_PERMISSIONS[role].includes(key);
  it('only the school administrator and the vice principal change subjects, teacher assignments and the timetable', () => {
    for (const role of ROLE_KEYS) {
      const editor = role === 'school_admin' || role === 'vice_principal';
      expect(has(role, 'academic.manage')).toBe(editor);
      expect(has(role, 'academic.timetable.manage')).toBe(editor);
    }
  });
  it('teachers can read academics (their timetable) but parents and students have no academic permissions', () => {
    expect(has('teacher', 'academic.read')).toBe(true);
    for (const role of ['parent', 'student'] as const) expect(has(role, 'academic.read')).toBe(false);
  });
});

describe('hostel warden (Phase 13C)', () => {
  const has = (role: (typeof ROLE_KEYS)[number], key: string) => ROLE_PERMISSIONS[role].includes(key);
  it('the warden manages the hostel and reads students, nothing else', () => {
    expect(has('hostel_warden', 'hostel.read')).toBe(true);
    expect(has('hostel_warden', 'hostel.manage')).toBe(true);
    expect(has('hostel_warden', 'student.read')).toBe(true);
    for (const key of ['student.update', 'fee.read', 'fee.collect', 'transport.manage', 'library.manage', 'payroll.read', 'school.role.manage']) expect(has('hostel_warden', key)).toBe(false);
  });
  it('only the school administrator and the warden can change the hostel; the principal can read it', () => {
    for (const role of ROLE_KEYS) if (has(role, 'hostel.manage')) expect(['school_admin', 'hostel_warden']).toContain(role);
    expect(has('principal', 'hostel.read')).toBe(true);
    expect(has('parent', 'hostel.read')).toBe(false);
    expect(has('student', 'hostel.read')).toBe(false);
  });
});

describe('store keeper (Phase 15A)', () => {
  const has = (role: (typeof ROLE_KEYS)[number], key: string) => ROLE_PERMISSIONS[role].includes(key);
  it('manages inventory (and can read announcements); only the school administrator and the store keeper change stock', () => {
    expect(has('store_keeper', 'inventory.read')).toBe(true);
    expect(has('store_keeper', 'inventory.manage')).toBe(true);
    for (const key of ['student.read', 'fee.read', 'payroll.read', 'accounts.read', 'school.role.manage']) expect(has('store_keeper', key)).toBe(false);
    for (const role of ROLE_KEYS) if (has(role, 'inventory.manage')) expect(['school_admin', 'store_keeper']).toContain(role);
  });
});

describe('visitors and complaints (Phase 15B)', () => {
  const has = (role: (typeof ROLE_KEYS)[number], key: string) => ROLE_PERMISSIONS[role].includes(key);
  it('the receptionist runs the gate log and can log and follow up complaints', () => {
    for (const key of ['visitor.read', 'visitor.manage', 'complaint.read', 'complaint.manage']) expect(has('receptionist', key)).toBe(true);
    for (const key of ['fee.read', 'payroll.read', 'inventory.read', 'student.update']) expect(has('receptionist', key)).toBe(false);
  });
  it('only the school administrator and the receptionist manage the visitors log', () => {
    for (const role of ROLE_KEYS) if (has(role, 'visitor.manage')) expect(['school_admin', 'receptionist']).toContain(role);
  });
  it('the principal and vice principal can resolve complaints; teachers and parents cannot even read them', () => {
    expect(has('principal', 'complaint.manage')).toBe(true);
    expect(has('vice_principal', 'complaint.manage')).toBe(true);
    for (const role of ['teacher', 'parent', 'student', 'librarian', 'store_keeper'] as const) { expect(has(role, 'complaint.read')).toBe(false); expect(has(role, 'visitor.read')).toBe(false); }
    for (const role of ROLE_KEYS) if (has(role, 'complaint.manage')) expect(['school_admin', 'principal', 'vice_principal', 'receptionist']).toContain(role);
  });
});

describe('announcements (Phase 16A)', () => {
  const has = (role: (typeof ROLE_KEYS)[number], key: string) => ROLE_PERMISSIONS[role].includes(key);
  it('every role that belongs to a school can read announcements', () => {
    for (const role of ROLE_KEYS) if (role !== 'super_admin') expect(has(role, 'communication.read')).toBe(true);
  });
  it('only the school administrator, principal and vice principal send them', () => {
    for (const role of ROLE_KEYS) if (has(role, 'communication.send')) expect(['school_admin', 'principal', 'vice_principal']).toContain(role);
    expect(has('principal', 'communication.send')).toBe(true);
    expect(has('vice_principal', 'communication.send')).toBe(true);
    expect(has('teacher', 'communication.send')).toBe(false);
    expect(has('parent', 'communication.send')).toBe(false);
  });
});

describe('certificates (Phase 17A)', () => {
  const has = (role: (typeof ROLE_KEYS)[number], key: string) => ROLE_PERMISSIONS[role].includes(key);
  it('only the school administrator, principal, vice principal and admission officer issue certificates', () => {
    for (const role of ROLE_KEYS) if (has(role, 'certificate.issue')) expect(['school_admin', 'principal', 'vice_principal', 'admission_officer']).toContain(role);
    for (const role of ['school_admin', 'principal', 'vice_principal', 'admission_officer'] as const) { expect(has(role, 'certificate.read')).toBe(true); expect(has(role, 'certificate.issue')).toBe(true); }
  });
  it('teachers, parents and students cannot even read the certificate register', () => {
    for (const role of ['teacher', 'parent', 'student', 'accountant', 'receptionist'] as const) expect(has(role, 'certificate.read')).toBe(false);
  });
});
