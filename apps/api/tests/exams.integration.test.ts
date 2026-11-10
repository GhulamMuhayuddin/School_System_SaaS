/**
 * Real database test of Phase 9A: exams, papers, marks (who may enter what), computed results and positions, publishing and
 * locking, grading scale, isolation. Needs the Phase 9 migration, `pnpm db:rls`, `pnpm db:seed`.
 * Run:  set RUN_DB_TESTS=1  then  pnpm --filter @nexora/api test
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ExamsService } from '../src/modules/exams/exams.service';
import type { Caller } from '../src/modules/exams/exams.types';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('exams (PostgreSQL)', () => {
  let owner: PrismaClient;
  let runtime: PrismaClient;
  let exams: ExamsService;
  const tag = `exm-${Date.now()}`;
  let a = '';
  let b = '';
  const id: Record<string, string> = {};
  const teacher = (): Caller => ({ userId: id.teacherUser, canManage: false });
  const otherTeacher = (): Caller => ({ userId: id.otherUser, canManage: false });
  const boss = (): Caller => ({ userId: id.adminUser, canManage: true });
  const papersOf = (kids: { subjectId: string; totalMarks: number; passMarks: number }[]) => kids;

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    exams = new ExamsService(runtime, () => new Date(Date.UTC(2026, 5, 15, 8, 0)));
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
    const staff = async (no: string, userId: string) =>
      (await owner.staff.create({ data: { schoolId: a, employeeNo: no, firstName: no, lastName: 'Staff', gender: 'FEMALE', phone: '0300-1', category: 'TEACHING', designation: 'Teacher', joiningDate: new Date('2026-01-01T00:00:00Z'), userId } })).id;
    id.tStaff = await staff('T-1', id.teacherUser);
    id.t2Staff = await staff('T-2', id.otherUser);

    id.session = (await owner.academicSession.create({ data: { schoolId: a, name: '2026-2027', startDate: new Date('2026-04-01T00:00:00Z'), endDate: new Date('2027-03-31T00:00:00Z'), isCurrent: true } })).id;
    id.classId = (await owner.schoolClass.create({ data: { schoolId: a, name: 'Class 4', level: 4 } })).id;
    id.s1 = (await owner.section.create({ data: { schoolId: a, classId: id.classId, name: 'S1' } })).id;
    id.s2 = (await owner.section.create({ data: { schoolId: a, classId: id.classId, name: 'S2' } })).id;
    id.math = (await owner.subject.create({ data: { schoolId: a, name: 'Math' } })).id;
    id.urdu = (await owner.subject.create({ data: { schoolId: a, name: 'Urdu' } })).id;
    id.art = (await owner.subject.create({ data: { schoolId: a, name: 'Art' } })).id; // not offered to the class
    for (const subjectId of [id.math, id.urdu]) await owner.classSubject.create({ data: { schoolId: a, classId: id.classId, subjectId } });
    await owner.teachingAssignment.create({ data: { schoolId: a, sessionId: id.session, sectionId: id.s1, subjectId: id.math, staffId: id.tStaff } });
    await owner.teachingAssignment.create({ data: { schoolId: a, sessionId: id.session, sectionId: id.s2, subjectId: id.math, staffId: id.t2Staff } });

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
      await owner.school.deleteMany({ where: { id: school } }); // exams, papers, marks, students ... cascade
    }
    await owner.$disconnect();
    await runtime.$disconnect();
  });

  it('uses the default grading scale until the school saves its own, and rejects a broken scale', async () => {
    expect((await exams.gradeBands(a)).isDefault).toBe(true);
    await expect(exams.setGradeBands(a, id.adminUser, [{ grade: 'A', minPercent: 50, remark: null }])).rejects.toMatchObject({ status: 400 });
    const own = await exams.setGradeBands(a, id.adminUser, [{ grade: 'Pass', minPercent: 40, remark: null }, { grade: 'Fail', minPercent: 0, remark: null }]);
    expect(own.isDefault).toBe(false);
    expect(own.bands.map((x) => x.grade)).toEqual(['Pass', 'Fail']);
    await exams.setGradeBands(a, id.adminUser, [{ grade: 'A', minPercent: 80, remark: null }, { grade: 'B', minPercent: 50, remark: null }, { grade: 'F', minPercent: 0, remark: null }]);
  });

  it('creates an exam in the current session and refuses a duplicate name', async () => {
    const created = await exams.createExam(a, id.adminUser, { name: 'Mid-Term', startDate: '2026-09-01', endDate: '2026-09-10' });
    id.exam = created.id;
    expect(created).toMatchObject({ name: 'Mid-Term', status: 'DRAFT', sessionName: '2026-2027', startDate: '2026-09-01', paperCount: 0 });
    await expect(exams.createExam(a, id.adminUser, { name: 'mid-term' })).rejects.toMatchObject({ status: 409 });
    expect((await exams.listExams(a, undefined)).map((e) => e.name)).toEqual(['Mid-Term']);
    await expect(exams.updateExam(a, id.adminUser, id.exam, { endDate: '2026-08-01' })).rejects.toMatchObject({ status: 400 });
  });

  it('sets the papers of a class, only with subjects the class is offered', async () => {
    await expect(exams.setPapers(a, id.adminUser, id.exam, id.classId, [{ subjectId: id.art, totalMarks: 50, passMarks: 17 }])).rejects.toMatchObject({ status: 400 });
    const detail = await exams.setPapers(a, id.adminUser, id.exam, id.classId, papersOf([{ subjectId: id.math, totalMarks: 100, passMarks: 33 }, { subjectId: id.urdu, totalMarks: 50, passMarks: 17 }]));
    expect(detail.papers.map((p) => [p.subjectName, p.totalMarks, p.students, p.entered])).toEqual([['Math', 100, 4, 0], ['Urdu', 50, 4, 0]]); // 4 active students, the withdrawn one is not counted
    id.mathPaper = detail.papers.find((p) => p.subjectName === 'Math')!.id;
    id.urduPaper = detail.papers.find((p) => p.subjectName === 'Urdu')!.id;
  });

  it('shows teachers only the sections they teach and refuses marks for other subjects or sections', async () => {
    const sheet = await exams.paperMarks(a, id.mathPaper, teacher());
    expect(sheet.students.map((s) => s.name)).toEqual(['K1 Kid', 'K2 Kid', 'K3 Kid']);
    expect(sheet.access).toEqual({ canEnter: true, reason: null });
    expect((await exams.paperMarks(a, id.mathPaper, boss())).students).toHaveLength(4);
    expect((await exams.paperMarks(a, id.urduPaper, teacher())).access).toEqual({ canEnter: false, reason: 'NOT_YOUR_SUBJECT' });
    await expect(exams.saveMarks(a, id.urduPaper, [{ studentId: id.k1, marks: 10 }], teacher())).rejects.toMatchObject({ status: 403 });
    await expect(exams.saveMarks(a, id.mathPaper, [{ studentId: id.k5, marks: 10 }], teacher())).rejects.toMatchObject({ status: 400 }); // other section
    await expect(exams.saveMarks(a, id.mathPaper, [{ studentId: id.gone, marks: 10 }], boss())).rejects.toMatchObject({ status: 400 });
  });

  it('validates marks, supports absent and clearing, and counts what is entered', async () => {
    await expect(exams.saveMarks(a, id.mathPaper, [{ studentId: id.k1, marks: 101 }], teacher())).rejects.toMatchObject({ status: 400 });
    await expect(exams.saveMarks(a, id.mathPaper, [{ studentId: id.k1, marks: 5 }, { studentId: id.k1, marks: 6 }], teacher())).rejects.toMatchObject({ status: 400 });
    await exams.saveMarks(a, id.mathPaper, [{ studentId: id.k1, marks: 90 }, { studentId: id.k2, marks: 80 }, { studentId: id.k3, absent: true }], teacher());
    await exams.saveMarks(a, id.mathPaper, [{ studentId: id.k5, marks: 80 }], otherTeacher());
    const sheet = await exams.paperMarks(a, id.mathPaper, boss());
    expect(sheet.students.map((s) => [s.name, s.marks, s.absent, s.entered])).toEqual([['K1 Kid', 90, false, true], ['K2 Kid', 80, false, true], ['K3 Kid', null, true, true], ['K5 Kid', 80, false, true]]);
    expect(sheet.paper.entered).toBe(4);
    const cleared = await exams.saveMarks(a, id.mathPaper, [{ studentId: id.k5, marks: null }], otherTeacher());
    expect(cleared.students.find((s) => s.studentId === id.k5)).toMatchObject({ marks: null, absent: false, entered: false });
    await exams.saveMarks(a, id.mathPaper, [{ studentId: id.k5, marks: 80 }], otherTeacher());
  });

  it('will not lower a paper total below a saved mark or remove a paper that has marks', async () => {
    await expect(exams.setPapers(a, id.adminUser, id.exam, id.classId, [{ subjectId: id.math, totalMarks: 85, passMarks: 33 }, { subjectId: id.urdu, totalMarks: 50, passMarks: 17 }])).rejects.toMatchObject({ status: 409 });
    await expect(exams.setPapers(a, id.adminUser, id.exam, id.classId, [{ subjectId: id.urdu, totalMarks: 50, passMarks: 17 }])).rejects.toMatchObject({ status: 409 });
    await expect(exams.deleteExam(a, id.adminUser, id.exam)).rejects.toMatchObject({ status: 409 });
  });

  it('computes results, grades and positions from the marks; incomplete students have no position', async () => {
    await exams.saveMarks(a, id.urduPaper, [{ studentId: id.k1, marks: 40 }, { studentId: id.k2, marks: 40 }, { studentId: id.k3, marks: 30 }], boss());
    const results = await exams.classResults(a, id.exam, id.classId, undefined);
    const by = Object.fromEntries(results.students.map((s) => [s.student.name, s]));
    expect(by['K1 Kid']).toMatchObject({ obtained: 130, total: 150, percentage: 86.67, grade: 'A', passed: true, position: 1, complete: true });
    expect(by['K2 Kid']).toMatchObject({ obtained: 120, percentage: 80, grade: 'A', position: 2 });
    expect(by['K3 Kid']).toMatchObject({ obtained: 30, passed: false, position: 3 }); // absent in Math = fail
    expect(by['K5 Kid']).toMatchObject({ complete: false, percentage: null, position: null });
    expect(results.summary).toEqual({ students: 4, complete: 3, incomplete: 1, passed: 2, failed: 1, passRate: 67 });
    expect((await exams.classResults(a, id.exam, id.classId, id.s2)).students.map((s) => s.student.name)).toEqual(['K5 Kid']);
    const one = await exams.studentResult(a, id.exam, id.k2);
    expect(one).toMatchObject({ classSize: 4, class: { name: 'Class 4' } });
    expect(one.result.position).toBe(2);
  });

  it('asks before publishing with marks missing, then locks the marks until unpublished', async () => {
    await expect(exams.publish(a, id.adminUser, id.exam, false)).rejects.toMatchObject({ status: 409, code: 'MARKS_INCOMPLETE', details: { missing: 1 } });
    const done = await exams.publish(a, id.adminUser, id.exam, true);
    expect(done.status).toBe('PUBLISHED');
    expect(done.publishedAt).not.toBeNull();
    await expect(exams.saveMarks(a, id.mathPaper, [{ studentId: id.k1, marks: 91 }], boss())).rejects.toMatchObject({ status: 409 });
    await expect(exams.updateExam(a, id.adminUser, id.exam, { name: 'Renamed' })).rejects.toMatchObject({ status: 409 });
    await expect(exams.publish(a, id.adminUser, id.exam, true)).rejects.toMatchObject({ status: 409 });
    expect((await exams.paperMarks(a, id.mathPaper, boss())).access).toEqual({ canEnter: false, reason: 'PUBLISHED' });
    const back = await exams.unpublish(a, id.adminUser, id.exam);
    expect(back).toMatchObject({ status: 'DRAFT', publishedAt: null });
    await exams.saveMarks(a, id.mathPaper, [{ studentId: id.k1, marks: 91 }], boss());
  });

  it('writes audit rows and never shows another school\'s exams or papers', async () => {
    const actions = (await owner.auditLog.findMany({ where: { schoolId: a, entity: 'exam' } })).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['exam.create', 'exam.papers.set', 'exam.marks.save', 'exam.publish', 'exam.unpublish', 'exam.grades.set']));
    expect(await exams.listExams(b, undefined)).toEqual([]);
    await expect(exams.getExam(b, id.exam)).rejects.toMatchObject({ status: 404 });
    await expect(exams.paperMarks(b, id.mathPaper, { userId: id.bUser, canManage: true })).rejects.toMatchObject({ status: 404 });
    await expect(exams.publish(b, id.bUser, id.exam, true)).rejects.toMatchObject({ status: 404 });
    await expect(exams.studentResult(b, id.exam, id.k1)).rejects.toMatchObject({ status: 404 });
  });

  it('deletes an exam that has no marks', async () => {
    const empty = await exams.createExam(a, id.adminUser, { name: 'Quiz' });
    await exams.deleteExam(a, id.adminUser, empty.id);
    await expect(exams.getExam(a, empty.id)).rejects.toMatchObject({ status: 404 });
  });
});
