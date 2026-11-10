/**
 * Real database test of Phase 12: student logins and the family-scoped portal.
 * Needs the migration that adds students.user_id, `pnpm db:rls`, `pnpm db:seed`.
 * Run:  set RUN_DB_TESTS=1  then  pnpm --filter @nexora/api test
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PortalService } from '../src/modules/portal/portal.service';
import { SchoolService } from '../src/modules/school/school.service';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('portal and student logins (PostgreSQL)', () => {
  let owner: PrismaClient; let runtime: PrismaClient; let portal: PortalService; let school: SchoolService;
  const tag = `pt-${Date.now()}`;
  let a = ''; let admin = ''; let momUser = ''; let otherUser = '';
  const id: Record<string, string> = {};
  const calls: string[] = [];
  const deps = {
    attendance: { studentHistory: async (_s: string, sid: string) => { calls.push(`att:${sid}`); return { student: { id: sid, admissionNo: '', name: '' }, from: '', to: '', records: [], totals: { present: 0, absent: 0, late: 0, leave: 0, marked: 0, percentage: null } }; } },
    exams: { listExams: async () => [], studentResult: async () => { throw new Error('unused'); } },
    fees: { listVouchers: async () => [], getVoucher: async () => { throw new Error('unused'); } },
    timetable: { sectionTimetable: async () => { throw new Error('unused'); } },
    calendar: { list: async () => [] },
    library: { studentLibrary: async () => ({ loans: [], unpaidFine: 0 }) },
    transport: { studentTransport: async () => ({ assignment: null }) },
    hostel: { studentHostel: async () => ({ allocation: null }) },
  };

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    portal = new PortalService(runtime, deps as never);
    school = new SchoolService(runtime);
    const role = async (key: string) => (await owner.role.findFirstOrThrow({ where: { schoolId: null, key } })).id;
    a = (await owner.school.create({ data: { name: `${tag} A`, code: `${tag}-a` } })).id;
    const user = async (label: string, roleKey: string) =>
      (await owner.user.create({ data: { schoolId: a, roleId: await role(roleKey), email: `${tag}.${label}@example.test`, passwordHash: 'x', firstName: label, lastName: 'User' } })).id;
    admin = await user('admin', 'school_admin'); momUser = await user('mom', 'parent'); otherUser = await user('other', 'parent');
    const cls = await owner.schoolClass.create({ data: { schoolId: a, name: 'Class 5', level: 1 } });
    const mk = (n: string) => owner.student.create({ data: { schoolId: a, admissionNo: `${tag}-${n}`, firstName: n, lastName: 'K', classId: cls.id, gender: 'MALE', dateOfBirth: new Date('2015-01-01T00:00:00Z'), admissionDate: new Date('2026-04-01T00:00:00Z') } as never });
    id.kid = (await mk('Kid')).id; id.sib = (await mk('Sib')).id; id.stranger = (await mk('Stranger')).id;
    const g = await owner.guardian.create({ data: { schoolId: a, name: 'Mom', phone: '0300', userId: momUser } as never });
    const g2 = await owner.guardian.create({ data: { schoolId: a, name: 'Other', phone: '0301', userId: otherUser } as never });
    await owner.studentGuardian.create({ data: { schoolId: a, studentId: id.kid, guardianId: g.id, relation: 'MOTHER' } as never });
    await owner.studentGuardian.create({ data: { schoolId: a, studentId: id.sib, guardianId: g.id, relation: 'MOTHER' } as never });
    await owner.studentGuardian.create({ data: { schoolId: a, studentId: id.stranger, guardianId: g2.id, relation: 'FATHER' } as never });
  });
  afterAll(async () => {
    await owner.school.delete({ where: { id: a } }).catch(() => {});
    await owner.$disconnect(); await runtime.$disconnect();
  });

  it('a parent sees only own children and gets 404 for anyone else', async () => {
    const r = await portal.children(a, momUser);
    expect(r.viewer).toBe('PARENT');
    expect(r.children.map((c) => c.id).sort()).toEqual([id.kid, id.sib].sort());
    await expect(portal.childAttendance(a, momUser, id.stranger, '2026-11')).rejects.toMatchObject({ status: 404 });
    await expect(portal.childTimetable(a, momUser, id.stranger)).rejects.toMatchObject({ status: 404 });
    await expect(portal.childFees(a, momUser, id.stranger)).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(0);
    await portal.childAttendance(a, momUser, id.kid, '2026-11');
    expect(calls).toEqual([`att:${id.kid}`]);
  });

  it('creates a student login once, and the student sees only themselves', async () => {
    const acc = await school.createStudentAccount(a, id.kid, { email: `${tag}.kid@example.test`, password: 'long-enough-pass-1' }, admin);
    expect(acc.email).toBe(`${tag}.kid@example.test`);
    await expect(school.createStudentAccount(a, id.kid, { email: `${tag}.kid2@example.test`, password: 'long-enough-pass-1' }, admin)).rejects.toMatchObject({ status: 409 });
    await expect(school.createStudentAccount(a, id.sib, { email: `${tag}.kid@example.test`, password: 'long-enough-pass-1' }, admin)).rejects.toMatchObject({ status: 409 });
    const kidUser = (await owner.student.findUniqueOrThrow({ where: { id: id.kid } })).userId!;
    const r = await portal.children(a, kidUser);
    expect(r.viewer).toBe('STUDENT');
    expect(r.children.map((c) => c.id)).toEqual([id.kid]);
    expect(r.children[0]!.relation).toBe('SELF');
    await expect(portal.childAttendance(a, kidUser, id.sib, '2026-11')).rejects.toMatchObject({ status: 404 });
    const audit = await owner.auditLog.findFirst({ where: { schoolId: a, action: 'school.user.create' } });
    expect(JSON.stringify(audit?.metadata)).not.toContain('long-enough-pass');
  });
});
