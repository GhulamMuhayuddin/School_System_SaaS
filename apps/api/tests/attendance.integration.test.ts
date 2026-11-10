/**
 * Real database test of Phase 8A: student and staff attendance (who may mark what, corrections, holidays,
 * monthly sheets, reports, isolation). The clock is fixed so "today" is 2026-06-15 in the school's time zone.
 * Needs the Phase 8 migration, `pnpm db:rls`, `pnpm db:seed`. Run:  set RUN_DB_TESTS=1  then  pnpm --filter @nexora/api test
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
import type { Caller } from '../src/modules/attendance/attendance.types';

const TODAY = '2026-06-15';
const YESTERDAY = '2026-06-14';
const TWO_DAYS_AGO = '2026-06-13';
const NOW = new Date(Date.UTC(2026, 5, 15, 8, 0)); // 13:00 in Karachi

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('attendance (PostgreSQL)', () => {
  let owner: PrismaClient;
  let runtime: PrismaClient;
  let attendance: AttendanceService;
  const tag = `att-${Date.now()}`;
  let a = '';
  let b = '';
  const id: Record<string, string> = {};
  const teacher = (): Caller => ({ userId: id.teacherUser, canCorrect: false });
  const otherTeacher = (): Caller => ({ userId: id.otherUser, canCorrect: false });
  const boss = (): Caller => ({ userId: id.adminUser, canCorrect: true });
  const entry = (studentId: string, status: 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE', remark?: string) => ({ studentId, status, remark });

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    attendance = new AttendanceService(runtime, () => NOW);
    const role = async (key: string) => (await owner.role.findFirstOrThrow({ where: { schoolId: null, key } })).id;
    const [adminRole, teacherRole] = await Promise.all([role('school_admin'), role('teacher')]);
    a = (await owner.school.create({ data: { name: `${tag} A`, code: `${tag}-a` } })).id;
    b = (await owner.school.create({ data: { name: `${tag} B`, code: `${tag}-b` } })).id;
    const user = async (label: string, roleId: string, schoolId: string) =>
      (await owner.user.create({ data: { schoolId, roleId, email: `${tag}.${label}@example.test`, passwordHash: 'x', firstName: label, lastName: 'User' } })).id;
    id.adminUser = await user('admin', adminRole, a);
    id.teacherUser = await user('teacher', teacherRole, a);
    id.otherUser = await user('other', teacherRole, a);
    id.bUser = await user('b', adminRole, b);

    const staff = async (no: string, extra: object = {}) =>
      (await owner.staff.create({ data: { schoolId: a, employeeNo: no, firstName: no, lastName: 'Staff', gender: 'FEMALE', phone: '0300-1', category: 'TEACHING', designation: 'Teacher', joiningDate: new Date('2026-01-01T00:00:00Z'), ...extra } })).id;
    id.tStaff = await staff('T-1', { userId: id.teacherUser });
    id.t2Staff = await staff('T-2', { userId: id.otherUser });
    id.futureStaff = await staff('F-1', { joiningDate: new Date('2026-07-01T00:00:00Z') });
    id.leftStaff = await staff('L-1', { status: 'LEFT' });

    id.session = (await owner.academicSession.create({ data: { schoolId: a, name: '2026-2027', startDate: new Date('2026-04-01T00:00:00Z'), endDate: new Date('2027-03-31T00:00:00Z'), isCurrent: true } })).id;
    id.classId = (await owner.schoolClass.create({ data: { schoolId: a, name: 'Class 4', level: 4 } })).id;
    id.s1 = (await owner.section.create({ data: { schoolId: a, classId: id.classId, name: 'S1' } })).id;
    id.s2 = (await owner.section.create({ data: { schoolId: a, classId: id.classId, name: 'S2' } })).id;
    id.subject = (await owner.subject.create({ data: { schoolId: a, name: 'English' } })).id;
    await owner.teachingAssignment.create({ data: { schoolId: a, sessionId: id.session, sectionId: id.s1, subjectId: id.subject, staffId: id.tStaff } });
    await owner.teachingAssignment.create({ data: { schoolId: a, sessionId: id.session, sectionId: id.s2, subjectId: id.subject, staffId: id.t2Staff } });

    const student = async (no: string, sectionId: string, extra: object = {}) =>
      (await owner.student.create({ data: { schoolId: a, admissionNo: `${tag}-${no}`, firstName: no, lastName: 'Kid', gender: 'MALE', dateOfBirth: new Date('2015-01-01T00:00:00Z'), admissionDate: new Date('2026-04-01T00:00:00Z'), classId: id.classId, sectionId, ...extra } })).id;
    id.k1 = await student('K1', id.s1);
    id.k2 = await student('K2', id.s1);
    id.k3 = await student('K3', id.s1);
    id.gone = await student('GONE', id.s1, { status: 'WITHDRAWN' });
    id.k5 = await student('K5', id.s2);
  });

  afterAll(async () => {
    if (!owner) return;
    for (const school of [a, b]) {
      await owner.auditLog.deleteMany({ where: { schoolId: school } });
      await owner.user.deleteMany({ where: { schoolId: school } });
      await owner.school.deleteMany({ where: { id: school } }); // students, staff, attendance ... cascade
    }
    await owner.$disconnect();
    await runtime.$disconnect();
  });

  it('shows an unmarked roster of the active students only, and who may mark it', async () => {
    const asTeacher = await attendance.sectionRoster(a, id.s1, undefined, teacher());
    expect(asTeacher.date).toBe(TODAY);
    expect(asTeacher.today).toBe(TODAY);
    expect(asTeacher.marked).toBe(false);
    expect(asTeacher.students.map((s) => s.name)).toEqual(['K1 Kid', 'K2 Kid', 'K3 Kid']); // the withdrawn student is not listed
    expect(asTeacher.students.every((s) => s.status === null)).toBe(true);
    expect(asTeacher.access).toEqual({ canMark: true, reason: null });
    expect((await attendance.sectionRoster(a, id.s1, undefined, otherTeacher())).access).toEqual({ canMark: false, reason: 'NOT_YOUR_SECTION' });
    expect((await attendance.sectionRoster(a, id.s1, undefined, boss())).access.canMark).toBe(true);
  });

  it('lets the section\'s teacher mark today and correct it the same day', async () => {
    const first = await attendance.markStudents(a, id.s1, { date: TODAY, entries: [entry(id.k1, 'PRESENT'), entry(id.k2, 'ABSENT', 'fever'), entry(id.k3, 'LATE')] }, teacher());
    expect(first.marked).toBe(true);
    expect(first.students.map((s) => s.status)).toEqual(['PRESENT', 'ABSENT', 'LATE']);
    expect(first.students[1].remark).toBe('fever');
    const fixed = await attendance.markStudents(a, id.s1, { date: TODAY, entries: [entry(id.k2, 'LEAVE', 'approved leave')] }, teacher());
    expect(fixed.students.find((s) => s.id === id.k2)?.status).toBe('LEAVE');
    expect(await owner.studentAttendance.count({ where: { studentId: id.k2 } })).toBe(1); // updated, not duplicated
    const logs = (await owner.auditLog.findMany({ where: { schoolId: a, entity: 'attendance' } })).map((l) => l.action);
    expect(logs).toContain('attendance.student.mark');
    expect(logs).toContain('attendance.student.correct'); // changing a status is a correction
  });

  it('refuses marking by the wrong teacher, past days without correction rights, future days and bad lists', async () => {
    const mark = (date: string, entries: ReturnType<typeof entry>[], who: Caller, section = id.s1) => attendance.markStudents(a, section, { date, entries }, who);
    await expect(mark(TODAY, [entry(id.k1, 'PRESENT')], otherTeacher())).rejects.toMatchObject({ status: 403 });
    await expect(mark(YESTERDAY, [entry(id.k1, 'PRESENT')], teacher())).rejects.toMatchObject({ status: 403 }); // needs attendance.correct
    await expect(mark('2026-06-16', [entry(id.k1, 'PRESENT')], boss())).rejects.toMatchObject({ status: 400 }); // future, even for a manager
    await expect(mark(TODAY, [entry(id.k1, 'PRESENT'), entry(id.k1, 'ABSENT')], teacher())).rejects.toMatchObject({ status: 400 }); // twice
    await expect(mark(TODAY, [entry(id.k5, 'PRESENT')], teacher())).rejects.toMatchObject({ status: 400 }); // student of another section
    await expect(mark(TODAY, [entry(id.gone, 'PRESENT')], teacher())).rejects.toMatchObject({ status: 400 }); // withdrawn student
    await expect(mark(TODAY, [entry(randomUUID(), 'PRESENT')], teacher())).rejects.toMatchObject({ status: 400 });
    await expect(attendance.markStudents(a, randomUUID(), { date: TODAY, entries: [entry(id.k1, 'PRESENT')] }, boss())).rejects.toMatchObject({ status: 404 });
  });

  it('lets someone with correction rights mark past days, and blocks holidays for everybody', async () => {
    const past = await attendance.markStudents(a, id.s1, { date: YESTERDAY, entries: [entry(id.k1, 'PRESENT'), entry(id.k2, 'PRESENT'), entry(id.k3, 'ABSENT')] }, boss());
    expect(past.access.canMark).toBe(true);
    expect((await attendance.sectionRoster(a, id.s1, YESTERDAY, teacher())).access.reason).toBe('PAST_DATE');

    await owner.calendarEvent.create({ data: { schoolId: a, title: 'Local holiday', type: 'HOLIDAY', startDate: new Date(`${TWO_DAYS_AGO}T00:00:00Z`), endDate: new Date(`${TWO_DAYS_AGO}T00:00:00Z`) } });
    const holiday = await attendance.sectionRoster(a, id.s1, TWO_DAYS_AGO, boss());
    expect(holiday.holiday).toEqual({ title: 'Local holiday' });
    expect(holiday.access.reason).toBe('HOLIDAY');
    await expect(attendance.markStudents(a, id.s1, { date: TWO_DAYS_AGO, entries: [entry(id.k1, 'PRESENT')] }, boss())).rejects.toMatchObject({ status: 409 });
    const logs = (await owner.auditLog.findMany({ where: { schoolId: a, entity: 'attendance', action: 'attendance.student.correct' } })).length;
    expect(logs).toBeGreaterThanOrEqual(2); // the same-day correction and the past-day marking
  });

  it('builds the monthly sheet with totals, percentages and holidays', async () => {
    const sheet = await attendance.sectionMonthly(a, id.s1, '2026-06');
    expect(sheet.days).toBe(30);
    expect(sheet.holidays).toEqual([TWO_DAYS_AGO]);
    expect(sheet.students.map((s) => s.name)).toEqual(['K1 Kid', 'K2 Kid', 'K3 Kid']);
    const k1 = sheet.students.find((s) => s.id === id.k1)!;
    expect(k1.records).toEqual({ [YESTERDAY]: 'PRESENT', [TODAY]: 'PRESENT' });
    expect(k1.totals).toEqual({ present: 2, absent: 0, late: 0, leave: 0, marked: 2, percentage: 100 });
    const k2 = sheet.students.find((s) => s.id === id.k2)!; // yesterday present, today leave
    expect(k2.totals).toMatchObject({ present: 1, leave: 1, marked: 2, percentage: 50 });
    const k3 = sheet.students.find((s) => s.id === id.k3)!; // yesterday absent, today late
    expect(k3.totals).toMatchObject({ absent: 1, late: 1, percentage: 50 });
    expect((await attendance.sectionMonthly(a, id.s1, '2026-05')).students.every((s) => s.totals.marked === 0)).toBe(true);
  });

  it('gives a student history and a report of low attendance, lowest first', async () => {
    const history = await attendance.studentHistory(a, id.k3, '2026-06-01', '2026-06-30');
    expect(history.records.map((r) => `${r.date}:${r.status}`)).toEqual([`${YESTERDAY}:ABSENT`, `${TODAY}:LATE`]);
    expect(history.totals.percentage).toBe(50);
    await expect(attendance.studentHistory(a, randomUUID(), '2026-06-01', '2026-06-30')).rejects.toMatchObject({ status: 404 });

    const all = await attendance.studentReport(a, { from: '2026-06-01', to: '2026-06-30', limit: 200 });
    expect(all.total).toBe(3);
    expect(all.rows[0].totals.percentage).toBe(50);
    expect(all.rows[2].student.name).toBe('K1 Kid'); // 100% last
    expect(all.rows[0].student.className).toBe('Class 4');
    const low = await attendance.studentReport(a, { from: '2026-06-01', to: '2026-06-30', below: 75, limit: 200 });
    expect(low.rows.map((r) => r.student.name).sort()).toEqual(['K2 Kid', 'K3 Kid']);
    expect((await attendance.studentReport(a, { from: '2026-06-01', to: '2026-06-30', sectionId: id.s2, limit: 200 })).total).toBe(0);
    expect((await attendance.studentReport(a, { from: '2026-06-01', to: '2026-06-30', limit: 1 })).rows).toHaveLength(1); // limit applies after counting
  });

  it('marks staff attendance for active staff only, never before joining or in the future', async () => {
    const roster = await attendance.staffRoster(a, undefined);
    expect(roster.staff.map((s) => s.employeeNo)).toEqual(['F-1', 'T-1', 'T-2']); // the staff member who left is not listed
    const after = await attendance.markStaff(a, { date: TODAY, entries: [{ staffId: id.tStaff, status: 'PRESENT' }, { staffId: id.t2Staff, status: 'LATE', remark: 'bus' }] }, boss());
    expect(after.marked).toBe(true);
    expect(after.staff.find((s) => s.id === id.t2Staff)).toMatchObject({ status: 'LATE', remark: 'bus' });
    await attendance.markStaff(a, { date: TODAY, entries: [{ staffId: id.t2Staff, status: 'PRESENT' }] }, boss());
    expect(await owner.staffAttendance.count({ where: { staffId: id.t2Staff } })).toBe(1);

    await expect(attendance.markStaff(a, { date: TODAY, entries: [{ staffId: id.futureStaff, status: 'PRESENT' }] }, boss())).rejects.toMatchObject({ status: 400 }); // joins in July
    await expect(attendance.markStaff(a, { date: TODAY, entries: [{ staffId: id.leftStaff, status: 'PRESENT' }] }, boss())).rejects.toMatchObject({ status: 400 });
    await expect(attendance.markStaff(a, { date: '2026-06-16', entries: [{ staffId: id.tStaff, status: 'PRESENT' }] }, boss())).rejects.toMatchObject({ status: 400 });
    await expect(attendance.markStaff(a, { date: TODAY, entries: [{ staffId: id.tStaff, status: 'PRESENT' }, { staffId: id.tStaff, status: 'LATE' }] }, boss())).rejects.toMatchObject({ status: 400 });

    const sheet = await attendance.staffMonthly(a, '2026-06');
    expect(sheet.staff.find((s) => s.id === id.tStaff)?.totals).toMatchObject({ present: 1, marked: 1, percentage: 100 });
    expect(sheet.holidays).toEqual([TWO_DAYS_AGO]);
  });

  it('never shows or changes another school\'s attendance', async () => {
    await expect(attendance.sectionRoster(b, id.s1, TODAY, { userId: id.bUser, canCorrect: true })).rejects.toMatchObject({ status: 404 });
    await expect(attendance.markStudents(b, id.s1, { date: TODAY, entries: [entry(id.k1, 'ABSENT')] }, { userId: id.bUser, canCorrect: true })).rejects.toMatchObject({ status: 404 });
    await expect(attendance.studentHistory(b, id.k1, '2026-06-01', '2026-06-30')).rejects.toMatchObject({ status: 404 });
    expect((await attendance.studentReport(b, { from: '2026-06-01', to: '2026-06-30', limit: 200 })).total).toBe(0);
    expect((await attendance.staffRoster(b, TODAY)).staff).toEqual([]);
    await expect(attendance.markStaff(b, { date: TODAY, entries: [{ staffId: id.tStaff, status: 'ABSENT' }] }, { userId: id.bUser, canCorrect: true })).rejects.toMatchObject({ status: 400 });

    const rows = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.school_id', ${b}, true)`;
      return { students: await tx.studentAttendance.findMany(), staff: await tx.staffAttendance.findMany() };
    });
    expect(rows.students).toHaveLength(0);
    expect(rows.staff).toHaveLength(0);
    expect(await owner.studentAttendance.count({ where: { schoolId: a } })).toBeGreaterThan(0);
  });
});
