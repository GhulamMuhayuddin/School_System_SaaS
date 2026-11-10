/**
 * Real database test of Phase 11A: homework per section and subject, teacher limits, submissions (status + marks), updates, list filters,
 * parent portal view, deletes, audit and isolation. Needs the migration that creates homework / homework_submissions, `pnpm db:rls`, `pnpm db:seed`.
 * Run:  set RUN_DB_TESTS=1  then  pnpm --filter @nexora/api test
 * The clock is fixed at 2026-11-04. Expected numbers are worked out by hand in the comments.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Caller } from '../src/modules/homework/homework.types';
import { HomeworkService } from '../src/modules/homework/homework.service';
import { PortalService } from '../src/modules/portal/portal.service';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('homework (PostgreSQL)', () => {
  let owner: PrismaClient;
  let runtime: PrismaClient;
  let hw: HomeworkService;
  let portal: PortalService;
  const tag = `hw-${Date.now()}`;
  const TODAY = '2026-11-04';
  let a = '';
  let b = '';
  const id: Record<string, string> = {};
  let t1: Caller; let t2: Caller; let boss: Caller;

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    const clock = () => new Date(Date.UTC(2026, 10, 4, 8, 0));
    hw = new HomeworkService(runtime, clock);
    portal = new PortalService(runtime, {} as never);
    const role = async (key: string) => (await owner.role.findFirstOrThrow({ where: { schoolId: null, key } })).id;
    a = (await owner.school.create({ data: { name: `${tag} A`, code: `${tag}-a` } })).id;
    b = (await owner.school.create({ data: { name: `${tag} B`, code: `${tag}-b` } })).id;
    const user = async (label: string, schoolId: string, roleKey: string) =>
      (await owner.user.create({ data: { schoolId, roleId: await role(roleKey), email: `${tag}.${label}@example.test`, passwordHash: 'x', firstName: label, lastName: 'User' } })).id;
    id.t1User = await user('t1', a, 'teacher'); id.t2User = await user('t2', a, 'teacher'); id.bossUser = await user('boss', a, 'school_admin');
    id.parentUser = await user('parent', a, 'parent'); id.bUser = await user('b', b, 'school_admin');
    t1 = { userId: id.t1User, canManage: false }; t2 = { userId: id.t2User, canManage: false }; boss = { userId: id.bossUser, canManage: true };

    id.session = (await owner.academicSession.create({ data: { schoolId: a, name: '2026-2027', startDate: new Date('2026-04-01T00:00:00Z'), endDate: new Date('2027-03-31T00:00:00Z'), isCurrent: true } })).id;
    id.classId = (await owner.schoolClass.create({ data: { schoolId: a, name: 'Class 5', level: 5 } })).id;
    id.s1 = (await owner.section.create({ data: { schoolId: a, classId: id.classId, name: 'S1' } })).id;
    id.s2 = (await owner.section.create({ data: { schoolId: a, classId: id.classId, name: 'S2' } })).id;
    id.math = (await owner.subject.create({ data: { schoolId: a, name: 'Math' } })).id;
    id.urdu = (await owner.subject.create({ data: { schoolId: a, name: 'Urdu' } })).id;
    id.art = (await owner.subject.create({ data: { schoolId: a, name: 'Art' } })).id; // not offered to the class
    for (const subjectId of [id.math, id.urdu]) await owner.classSubject.create({ data: { schoolId: a, classId: id.classId, subjectId } });
    const staff = async (no: string, userId: string) =>
      (await owner.staff.create({ data: { schoolId: a, employeeNo: `${tag}-${no}`, firstName: no, lastName: 'Staff', gender: 'FEMALE', phone: '0300-1', category: 'TEACHING', designation: 'Teacher', joiningDate: new Date('2026-01-01T00:00:00Z'), userId } })).id;
    id.t1Staff = await staff('T1', id.t1User); id.t2Staff = await staff('T2', id.t2User);
    await owner.teachingAssignment.create({ data: { schoolId: a, sessionId: id.session, sectionId: id.s1, subjectId: id.math, staffId: id.t1Staff } });
    await owner.teachingAssignment.create({ data: { schoolId: a, sessionId: id.session, sectionId: id.s2, subjectId: id.math, staffId: id.t2Staff } });

    const student = async (no: string, sectionId: string | null, extra: object = {}) =>
      (await owner.student.create({ data: { schoolId: a, admissionNo: `${tag}-${no}`, firstName: no, lastName: 'Kid', gender: 'MALE', dateOfBirth: new Date('2015-01-01T00:00:00Z'), admissionDate: new Date('2026-04-01T00:00:00Z'), classId: id.classId, sectionId, ...extra } })).id;
    id.k1 = await student('K1', id.s1); id.k2 = await student('K2', id.s1); id.k3 = await student('K3', id.s2);
    id.gone = await student('GONE', id.s1, { status: 'WITHDRAWN' });
    const guardian = await owner.guardian.create({ data: { schoolId: a, name: 'Parent One', phone: '0300-9', userId: id.parentUser } });
    await owner.studentGuardian.create({ data: { schoolId: a, studentId: id.k1, guardianId: guardian.id, relation: 'FATHER', isPrimary: true } });
  });

  afterAll(async () => {
    if (!owner) return;
    for (const school of [a, b]) {
      await owner.auditLog.deleteMany({ where: { schoolId: school } });
      await owner.user.deleteMany({ where: { schoolId: school } });
      await owner.school.deleteMany({ where: { id: school } }); // homework, submissions, students ... cascade
    }
    await owner.$disconnect();
    await runtime.$disconnect();
  });

  it('a teacher creates homework for a section and subject they teach; others are refused', async () => {
    const created = await hw.create(a, t1, { sectionId: id.s1, subjectId: id.math, title: 'Fractions worksheet', assignedDate: '2026-11-02', dueDate: '2026-11-06', maxMarks: 10 });
    id.hw1 = created.id;
    expect(created).toMatchObject({ title: 'Fractions worksheet', state: 'UPCOMING', maxMarks: 10, subject: { name: 'Math' }, section: { name: 'S1' }, class: { name: 'Class 5' } });
    expect(created.counts).toEqual({ students: 2, submitted: 0, late: 0, missing: 0, pending: 2 }); // K1, K2; the withdrawn student is not counted
    expect(created.roster.map((r) => r.name)).toEqual(['K1 Kid', 'K2 Kid']);
    expect(created.access).toEqual({ canEdit: true, reason: null });

    await expect(hw.create(a, t1, { sectionId: id.s2, subjectId: id.math, title: 'Other section', dueDate: '2026-11-06' })).rejects.toMatchObject({ status: 403 });
    await expect(hw.create(a, t1, { sectionId: id.s1, subjectId: id.urdu, title: 'Other subject', dueDate: '2026-11-06' })).rejects.toMatchObject({ status: 403 });
    const manager = await hw.create(a, boss, { sectionId: id.s1, subjectId: id.urdu, title: 'Urdu essay', dueDate: '2026-11-20' }); // academic.manage may work with any section; no maximum marks
    id.hw2 = manager.id;
    expect(manager.assignedDate).toBe(TODAY);

    await expect(hw.create(a, boss, { sectionId: id.s1, subjectId: id.art, title: 'Not offered', dueDate: '2026-11-06' })).rejects.toMatchObject({ status: 400 });
    await expect(hw.create(a, boss, { sectionId: id.s1, subjectId: id.urdu, title: 'Backwards', assignedDate: '2026-11-03', dueDate: '2026-11-02' })).rejects.toMatchObject({ status: 400 });
    await expect(hw.create(a, boss, { sectionId: id.s1, subjectId: id.urdu, title: 'Future', assignedDate: '2026-11-05', dueDate: '2026-11-06' })).rejects.toMatchObject({ status: 400 });
    await expect(hw.create(a, boss, { sectionId: '00000000-0000-4000-8000-000000000000', subjectId: id.urdu, title: 'No section', dueDate: '2026-11-06' })).rejects.toMatchObject({ status: 404 });
    await expect(hw.create(a, boss, { sectionId: id.s1, subjectId: '00000000-0000-4000-8000-000000000000', title: 'No subject', dueDate: '2026-11-06' })).rejects.toMatchObject({ status: 404 });
    expect(await owner.homework.count({ where: { schoolId: a } })).toBe(2);
  });

  it('another teacher can read it but not change it', async () => {
    const seen = await hw.get(a, id.hw1, t2);
    expect(seen.access).toEqual({ canEdit: false, reason: 'NOT_YOUR_SUBJECT' });
    await expect(hw.update(a, t2, id.hw1, { title: 'Hijacked' })).rejects.toMatchObject({ status: 403 });
    await expect(hw.remove(a, t2, id.hw1)).rejects.toMatchObject({ status: 403 });
    await expect(hw.saveSubmissions(a, t2, id.hw1, [{ studentId: id.k1, status: 'SUBMITTED' }])).rejects.toMatchObject({ status: 403 });
    await expect(hw.get(a, '00000000-0000-4000-8000-000000000000', t1)).rejects.toMatchObject({ status: 404 });
  });

  it('records submissions with marks, refuses bad ones without changing anything, and can mark missing or clear', async () => {
    const saved = await hw.saveSubmissions(a, t1, id.hw1, [{ studentId: id.k1, status: 'SUBMITTED', marks: 8 }, { studentId: id.k2, status: 'LATE', marks: 6, remark: 'Next day' }]);
    expect(saved.counts).toEqual({ students: 2, submitted: 1, late: 1, missing: 0, pending: 0 });
    expect(saved.roster.map((r) => [r.status, r.marks, r.remark])).toEqual([['SUBMITTED', 8, null], ['LATE', 6, 'Next day']]);

    const attempts: (() => Promise<unknown>)[] = [
      () => hw.saveSubmissions(a, t1, id.hw1, [{ studentId: id.k1, status: 'SUBMITTED', marks: 11 }]), // above the maximum of 10
      () => hw.saveSubmissions(a, t1, id.hw1, [{ studentId: id.k1, status: 'MISSING', marks: 3 }]), // marks for work not handed in
      () => hw.saveSubmissions(a, t1, id.hw1, [{ studentId: id.gone, status: 'SUBMITTED' }]), // withdrawn
      () => hw.saveSubmissions(a, t1, id.hw1, [{ studentId: id.k3, status: 'SUBMITTED' }]), // other section
      () => hw.saveSubmissions(a, t1, id.hw1, [{ studentId: id.k1, status: 'LATE' }, { studentId: id.k1, status: 'MISSING' }]), // twice in the list
      () => hw.saveSubmissions(a, boss, id.hw2, [{ studentId: id.k1, status: 'SUBMITTED', marks: 1 }]), // hw2 has no maximum marks
    ];
    for (const run of attempts) await expect(run()).rejects.toMatchObject({ status: 400 });
    expect((await hw.get(a, id.hw1, t1)).roster.map((r) => [r.status, r.marks])).toEqual([['SUBMITTED', 8], ['LATE', 6]]); // untouched

    const missing = await hw.saveSubmissions(a, t1, id.hw1, [{ studentId: id.k2, status: 'MISSING' }]);
    expect(missing.counts).toMatchObject({ submitted: 1, late: 0, missing: 1, pending: 0 });
    expect(missing.roster[1]).toMatchObject({ status: 'MISSING', marks: null });
    const cleared = await hw.saveSubmissions(a, t1, id.hw1, [{ studentId: id.k2, status: null }]);
    expect(cleared.counts).toEqual({ students: 2, submitted: 1, late: 0, missing: 0, pending: 1 });
    expect(cleared.roster[1]).toMatchObject({ status: null, marks: null });
  });

  it('updates title and due date, and protects saved marks from a lower maximum', async () => {
    const u = await hw.update(a, t1, id.hw1, { title: 'Fractions worksheet 2', dueDate: '2026-11-03' });
    expect(u).toMatchObject({ title: 'Fractions worksheet 2', dueDate: '2026-11-03', state: 'OVERDUE' }); // due yesterday
    await expect(hw.update(a, t1, id.hw1, { maxMarks: 5 })).rejects.toMatchObject({ status: 400 }); // K1 already has 8
    await expect(hw.update(a, t1, id.hw1, { maxMarks: null })).rejects.toMatchObject({ status: 400 });
    await expect(hw.update(a, t1, id.hw1, { dueDate: '2026-11-01' })).rejects.toMatchObject({ status: 400 }); // before the assigned date 2026-11-02
    expect((await hw.update(a, t1, id.hw1, { maxMarks: 20 })).maxMarks).toBe(20);
    expect((await hw.update(a, t1, id.hw1, { description: 'Do pages 10-12' })).description).toBe('Do pages 10-12');
  });

  it('lists newest due date first and filters', async () => {
    const all = await hw.list(a, {}, boss);
    expect(all.map((h) => h.id)).toEqual([id.hw2, id.hw1]); // due 2026-11-20, then 2026-11-03
    expect(all[1]!.counts).toEqual({ students: 2, submitted: 1, late: 0, missing: 0, pending: 1 });
    expect(all[0]!.counts.pending).toBe(2);
    expect((await hw.list(a, { sectionId: id.s1 }, boss)).length).toBe(2);
    expect(await hw.list(a, { sectionId: id.s2 }, boss)).toEqual([]);
    expect((await hw.list(a, { classId: id.classId, subjectId: id.math }, boss)).map((h) => h.id)).toEqual([id.hw1]);
    expect((await hw.list(a, { mine: true }, t1)).map((h) => h.id)).toEqual([id.hw1]);
    expect((await hw.list(a, { mine: true }, boss)).map((h) => h.id)).toEqual([id.hw2]);
    expect((await hw.list(a, { from: '2026-11-10' }, boss)).map((h) => h.id)).toEqual([id.hw2]);
    expect((await hw.list(a, { to: '2026-11-05' }, boss)).map((h) => h.id)).toEqual([id.hw1]);
  });

  it('a parent sees the homework of their own child only, with the child\'s status', async () => {
    const mine = await portal.childHomework(a, id.parentUser, id.k1, {}, TODAY);
    expect(mine.map((h) => [h.title, h.subject, h.status, h.marks, h.state])).toEqual([['Urdu essay', 'Urdu', 'PENDING', null, 'UPCOMING'], ['Fractions worksheet 2', 'Math', 'SUBMITTED', 8, 'OVERDUE']]);
    expect(mine[1]).toMatchObject({ maxMarks: 20, dueDate: '2026-11-03', assignedDate: '2026-11-02' });
    expect((await portal.childHomework(a, id.parentUser, id.k1, { from: '2026-11-10' }, TODAY)).map((h) => h.title)).toEqual(['Urdu essay']);
    await expect(portal.childHomework(a, id.parentUser, id.k2, {}, TODAY)).rejects.toMatchObject({ status: 404 }); // not their child
    await expect(portal.childHomework(a, id.parentUser, id.k3, {}, TODAY)).rejects.toMatchObject({ status: 404 });
    await expect(portal.childHomework(a, id.t1User, id.k1, {}, TODAY)).rejects.toMatchObject({ status: 404 }); // not a guardian
  });

  it('deletes homework with its submissions, only for someone who may edit it', async () => {
    await expect(hw.remove(a, t2, id.hw1)).rejects.toMatchObject({ status: 403 });
    await hw.remove(a, t1, id.hw1);
    expect(await owner.homework.count({ where: { id: id.hw1 } })).toBe(0);
    expect(await owner.homeworkSubmission.count({ where: { homeworkId: id.hw1 } })).toBe(0);
    await expect(hw.get(a, id.hw1, boss)).rejects.toMatchObject({ status: 404 });
  });

  it('writes audit rows', async () => {
    const count = (action: string) => owner.auditLog.count({ where: { schoolId: a, action } });
    expect(await count('homework.create')).toBe(2);
    expect(await count('homework.update')).toBe(3); // title + due date, maximum 20, description; refused ones leave nothing
    expect(await count('homework.submissions.save')).toBe(3); // first save, MISSING, clear
    expect(await count('homework.delete')).toBe(1);
  });

  it('keeps schools apart, including a raw RLS query', async () => {
    const bBoss: Caller = { userId: id.bUser, canManage: true };
    await expect(hw.get(b, id.hw2, bBoss)).rejects.toMatchObject({ status: 404 });
    expect(await hw.list(b, {}, bBoss)).toEqual([]);
    await expect(hw.create(b, bBoss, { sectionId: id.s1, subjectId: id.urdu, title: 'Foreign section', dueDate: '2026-11-06' })).rejects.toMatchObject({ status: 400 }); // school B has no current session
    await expect(hw.saveSubmissions(b, bBoss, id.hw2, [{ studentId: id.k1, status: 'SUBMITTED' }])).rejects.toMatchObject({ status: 404 });
    await expect(hw.update(b, bBoss, id.hw2, { title: 'Not mine' })).rejects.toMatchObject({ status: 404 });
    await expect(portal.childHomework(b, id.parentUser, id.k1, {}, TODAY)).rejects.toMatchObject({ status: 404 });

    const rows = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.school_id', ${b}, true)`;
      return { homework: await tx.homework.findMany(), submissions: await tx.homeworkSubmission.findMany() };
    });
    expect(rows.homework).toHaveLength(0);
    expect(rows.submissions).toHaveLength(0);
    expect(await owner.homework.count({ where: { schoolId: a } })).toBe(1);
  });
});
