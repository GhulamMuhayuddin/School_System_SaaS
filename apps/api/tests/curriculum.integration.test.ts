/**
 * Real database test of Phase 7A: sessions, subjects, class subjects, periods, teacher assignments and the timetable
 * (including "a teacher cannot be in two places" and isolation between schools).
 * Needs the Phase 7A migration, `pnpm db:rls`, `pnpm db:seed`. Run:  set RUN_DB_TESTS=1  then  pnpm --filter @nexora/api test
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AcademicsService } from '../src/modules/academics/academics.service';
import { TimetableService } from '../src/modules/timetable/timetable.service';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('curriculum and timetable (PostgreSQL)', () => {
  let owner: PrismaClient;
  let runtime: PrismaClient;
  let academics: AcademicsService;
  let timetable: TimetableService;
  const tag = `cur-${Date.now()}`;
  let a = '';
  let b = '';
  let actor = '';
  const ids = {
    s1: '', s2: '', classId: '', secA: '', secB: '', math: '', english: '', art: '', p1: '', p2: '', brk: '',
    t1: '', t2: '', admin: '', left: '', bTeacher: '',
  };
  const staffData = (schoolId: string, no: string, over: object = {}) => ({
    schoolId, employeeNo: no, firstName: no, lastName: 'Teacher', gender: 'FEMALE' as const, phone: '0300-0000000',
    category: 'TEACHING' as const, designation: 'Teacher', joiningDate: new Date('2026-04-01T00:00:00Z'), ...over,
  });
  const lesson = (sectionId: string, dayOfWeek: number, periodId: string, subjectId: string) => ({ sectionId, dayOfWeek, periodId, subjectId });

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    academics = new AcademicsService(runtime);
    timetable = new TimetableService(runtime);
    const admin = await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'school_admin' } });
    a = (await owner.school.create({ data: { name: `${tag} A`, code: `${tag}-a` } })).id;
    b = (await owner.school.create({ data: { name: `${tag} B`, code: `${tag}-b` } })).id;
    actor = (await owner.user.create({ data: { schoolId: a, roleId: admin.id, email: `${tag}@example.test`, passwordHash: 'x', firstName: 'A', lastName: 'A' } })).id;
    ids.t1 = (await owner.staff.create({ data: staffData(a, 'T-1') })).id;
    ids.t2 = (await owner.staff.create({ data: staffData(a, 'T-2') })).id;
    ids.admin = (await owner.staff.create({ data: staffData(a, 'AD-1', { category: 'ADMINISTRATIVE' }) })).id;
    ids.left = (await owner.staff.create({ data: staffData(a, 'L-1', { status: 'LEFT' }) })).id;
    ids.bTeacher = (await owner.staff.create({ data: staffData(b, 'BT-1') })).id;
  });

  afterAll(async () => {
    if (!owner) return;
    for (const id of [a, b]) {
      await owner.auditLog.deleteMany({ where: { schoolId: id } });
      await owner.user.deleteMany({ where: { schoolId: id } });
      await owner.school.deleteMany({ where: { id } }); // sessions, subjects, periods, staff, timetable ... cascade
    }
    await owner.$disconnect();
    await runtime.$disconnect();
  });

  it('manages academic sessions: first is current, one current at a time, guarded deletes', async () => {
    const s1 = await academics.createSession(a, { name: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31' }, actor);
    const s2 = await academics.createSession(a, { name: '2027-2028', startDate: '2027-04-01', endDate: '2028-03-31' }, actor);
    ids.s1 = s1.id;
    ids.s2 = s2.id;
    expect(s1.isCurrent).toBe(true);
    expect(s2.isCurrent).toBe(false);
    await expect(academics.createSession(a, { name: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31' }, actor)).rejects.toMatchObject({ status: 409 });
    await expect(academics.updateSession(a, s2.id, { endDate: '2027-03-01' }, actor)).rejects.toMatchObject({ status: 400 });
    await expect(academics.deleteSession(a, s1.id, actor)).rejects.toMatchObject({ status: 409 }); // current

    await academics.setCurrentSession(a, s2.id, actor);
    expect((await academics.listSessions(a)).filter((s) => s.isCurrent).map((s) => s.id)).toEqual([s2.id]);
    await academics.setCurrentSession(a, s1.id, actor);

    const temp = await academics.createSession(a, { name: 'Temp', startDate: '2030-04-01', endDate: '2031-03-31' }, actor);
    await academics.deleteSession(a, temp.id, actor);
    expect(await academics.listSessions(a)).toHaveLength(2);
  });

  it('manages subjects and the subjects of a class, never mixing schools', async () => {
    const klass = await academics.createClass(a, { name: 'Class 5', level: 5 }, actor);
    ids.classId = klass.id;
    const withA = await academics.createSection(a, klass.id, { name: 'A' }, actor);
    const withB = await academics.createSection(a, klass.id, { name: 'B' }, actor);
    ids.secA = withA.sections.find((s) => s.name === 'A')!.id;
    ids.secB = withB.sections.find((s) => s.name === 'B')!.id;

    ids.math = (await academics.createSubject(a, { name: 'Mathematics', code: 'MTH' }, actor)).id;
    ids.english = (await academics.createSubject(a, { name: 'English' }, actor)).id;
    ids.art = (await academics.createSubject(a, { name: 'Art' }, actor)).id;
    await expect(academics.createSubject(a, { name: 'Art' }, actor)).rejects.toMatchObject({ status: 409 });
    expect((await academics.updateSubject(a, ids.english, { code: 'ENG' }, actor)).code).toBe('ENG');

    expect((await academics.setClassSubjects(a, klass.id, [ids.math, ids.english], actor)).subjects.map((s) => s.name)).toEqual(['English', 'Mathematics']);
    await expect(academics.setClassSubjects(a, klass.id, [ids.math, randomUUID()], actor)).rejects.toMatchObject({ status: 400 });
    const foreign = await academics.createSubject(b, { name: 'Science' }, actor);
    await expect(academics.setClassSubjects(a, klass.id, [ids.math, foreign.id], actor)).rejects.toMatchObject({ status: 400 });
    expect((await academics.listSubjects(a)).find((s) => s.id === ids.math)?.classCount).toBe(1);
  });

  it('keeps school periods in order and refuses overlaps, duplicates and bad times', async () => {
    ids.p1 = (await timetable.createPeriod(a, { name: 'Period 1', startTime: '08:00', endTime: '08:40' }, actor)).id;
    ids.p2 = (await timetable.createPeriod(a, { name: 'Period 2', startTime: '08:40', endTime: '09:20' }, actor)).id;
    ids.brk = (await timetable.createPeriod(a, { name: 'Break', startTime: '09:20', endTime: '09:40', isBreak: true }, actor)).id;
    await expect(timetable.createPeriod(a, { name: 'Clash', startTime: '08:30', endTime: '09:00' }, actor)).rejects.toMatchObject({ status: 409 });
    await expect(timetable.createPeriod(a, { name: 'Period 1', startTime: '10:00', endTime: '10:40' }, actor)).rejects.toMatchObject({ status: 409 });
    await expect(timetable.updatePeriod(a, ids.p2, { endTime: '08:30' }, actor)).rejects.toMatchObject({ status: 400 });
    expect((await timetable.listPeriods(a)).map((p) => p.name)).toEqual(['Period 1', 'Period 2', 'Break']);
  });

  it('assigns only active teaching staff to subjects the class really studies, and can change the teacher', async () => {
    const sec = ids.secA;
    await expect(timetable.assign(a, { sectionId: sec, subjectId: ids.art, staffId: ids.t1 }, actor)).rejects.toMatchObject({ status: 400 }); // Art is not in Class 5
    await expect(timetable.assign(a, { sectionId: sec, subjectId: ids.math, staffId: ids.admin }, actor)).rejects.toMatchObject({ status: 400 });
    await expect(timetable.assign(a, { sectionId: sec, subjectId: ids.math, staffId: ids.left }, actor)).rejects.toMatchObject({ status: 400 });
    await expect(timetable.assign(a, { sectionId: sec, subjectId: ids.math, staffId: randomUUID() }, actor)).rejects.toMatchObject({ status: 404 });
    await expect(timetable.assign(a, { sectionId: sec, subjectId: ids.math, staffId: ids.bTeacher }, actor)).rejects.toMatchObject({ status: 404 }); // other school

    const first = await timetable.assign(a, { sectionId: sec, subjectId: ids.math, staffId: ids.t1 }, actor);
    expect(first.staff.id).toBe(ids.t1);
    const changed = await timetable.assign(a, { sectionId: sec, subjectId: ids.math, staffId: ids.t2 }, actor);
    expect(changed.id).toBe(first.id); // same assignment, new teacher
    expect(changed.staff.id).toBe(ids.t2);
    expect(await timetable.listAssignments(a, {})).toHaveLength(1);
    expect(await timetable.listAssignments(a, { staffId: ids.t1 })).toHaveLength(0);
  });

  it('places lessons, takes the teacher from the assignment and refuses a teacher in two places', async () => {
    const e1 = await timetable.setEntry(a, lesson(ids.secA, 1, ids.p1, ids.math), actor);
    expect(e1.staff?.id).toBe(ids.t2);
    await expect(timetable.setEntry(a, lesson(ids.secA, 1, ids.brk, ids.math), actor)).rejects.toMatchObject({ status: 400 }); // break
    await expect(timetable.setEntry(a, lesson(ids.secA, 1, ids.p2, ids.art), actor)).rejects.toMatchObject({ status: 400 }); // not in class

    // the same teacher teaches Maths in section B too
    await timetable.assign(a, { sectionId: ids.secB, subjectId: ids.math, staffId: ids.t2 }, actor);
    await expect(timetable.setEntry(a, lesson(ids.secB, 1, ids.p1, ids.math), actor)).rejects.toMatchObject({ status: 409 }); // t2 is in A at that time
    expect((await timetable.setEntry(a, lesson(ids.secB, 1, ids.p2, ids.math), actor)).staff?.id).toBe(ids.t2);
    await expect(timetable.setEntry(a, lesson(ids.secA, 1, ids.p2, ids.math), actor)).rejects.toMatchObject({ status: 409 }); // and now busy in B

    // replacing a cell keeps one lesson per slot; a subject without a teacher gets none
    const replaced = await timetable.setEntry(a, lesson(ids.secA, 1, ids.p1, ids.english), actor);
    expect(replaced.id).toBe(e1.id);
    expect(replaced.staff).toBeNull();
    // giving English a teacher fills the teacher into the lessons that already exist
    await timetable.assign(a, { sectionId: ids.secA, subjectId: ids.english, staffId: ids.t1 }, actor);
    const afterAssign = await timetable.sectionTimetable(a, ids.secA);
    expect(afterAssign.entries.find((e) => e.id === e1.id)?.staff?.id).toBe(ids.t1);
  });

  it('refuses to move a lesson series to a teacher who is busy at one of those times', async () => {
    await timetable.setEntry(a, lesson(ids.secA, 2, ids.p1, ids.math), actor); // A Tuesday P1, teacher t2
    await timetable.assign(a, { sectionId: ids.secB, subjectId: ids.english, staffId: ids.t1 }, actor);
    await timetable.setEntry(a, lesson(ids.secB, 2, ids.p1, ids.english), actor); // B Tuesday P1, teacher t1
    await expect(timetable.assign(a, { sectionId: ids.secA, subjectId: ids.math, staffId: ids.t1 }, actor)).rejects.toMatchObject({ status: 409 });
    const stillT2 = (await timetable.sectionTimetable(a, ids.secA)).entries.find((e) => e.dayOfWeek === 2);
    expect(stillT2?.staff?.id).toBe(ids.t2); // nothing changed
  });

  it('shows a section timetable and a teacher timetable, and unassigning removes the teacher from the lessons', async () => {
    const section = await timetable.sectionTimetable(a, ids.secA);
    expect(section.section.className).toBe('Class 5');
    expect(section.periods.map((p) => p.name)).toEqual(['Period 1', 'Period 2', 'Break']);
    expect(section.entries.map((e) => `${e.dayOfWeek}-${e.period.name}-${e.subject.name}`).sort()).toEqual(['1-Period 1-English', '2-Period 1-Mathematics']);

    const teacher = await timetable.teacherTimetable(a, ids.t1);
    expect(teacher.staff.id).toBe(ids.t1);
    expect(teacher.entries.every((e) => e.staff?.id === ids.t1)).toBe(true);
    expect(teacher.entries.map((e) => `${e.section.className}-${e.section.name}`).sort()).toEqual(['Class 5-A', 'Class 5-B']);

    const english = (await timetable.listAssignments(a, { sectionId: ids.secA })).find((x) => x.subject.id === ids.english)!;
    await timetable.unassign(a, english.id, actor);
    const after = await timetable.sectionTimetable(a, ids.secA);
    expect(after.entries.find((e) => e.dayOfWeek === 1)?.staff).toBeNull();
  });

  it('guards deletes of things that are in use', async () => {
    await expect(timetable.deletePeriod(a, ids.p1, actor)).rejects.toMatchObject({ status: 409 });
    await expect(timetable.updatePeriod(a, ids.p1, { isBreak: true }, actor)).rejects.toMatchObject({ status: 409 });
    await expect(academics.deleteSubject(a, ids.math, actor)).rejects.toMatchObject({ status: 409 });
    await expect(academics.setClassSubjects(a, ids.classId, [ids.english], actor)).rejects.toMatchObject({ status: 409 }); // would drop Maths
    await academics.setCurrentSession(a, ids.s2, actor);
    await expect(academics.deleteSession(a, ids.s1, actor)).rejects.toMatchObject({ status: 409 }); // has lessons
    await academics.setCurrentSession(a, ids.s1, actor);

    await owner.timetableEntry.deleteMany({ where: { periodId: ids.p1 } });
    await timetable.deletePeriod(a, ids.p1, actor);
    expect((await timetable.listPeriods(a)).map((p) => p.name)).toEqual(['Period 2', 'Break']);
  });

  it('never shows or changes another school\'s data', async () => {
    await academics.createSession(b, { name: 'B-2026', startDate: '2026-04-01', endDate: '2027-03-31' }, actor);
    const someEntry = await owner.timetableEntry.findFirstOrThrow({ where: { schoolId: a } });
    const someAssignment = await owner.teachingAssignment.findFirstOrThrow({ where: { schoolId: a } });

    expect(await timetable.listPeriods(b)).toEqual([]);
    expect(await timetable.listAssignments(b, {})).toEqual([]);
    await expect(timetable.sectionTimetable(b, ids.secA)).rejects.toMatchObject({ status: 404 });
    await expect(timetable.teacherTimetable(b, ids.t1)).rejects.toMatchObject({ status: 404 });
    await expect(timetable.setEntry(b, lesson(ids.secA, 3, ids.p2, ids.math), actor)).rejects.toMatchObject({ status: 404 });
    await expect(timetable.deleteEntry(b, someEntry.id, actor)).rejects.toMatchObject({ status: 404 });
    await expect(timetable.unassign(b, someAssignment.id, actor)).rejects.toMatchObject({ status: 404 });
    await expect(academics.getClassSubjects(b, ids.classId)).rejects.toMatchObject({ status: 404 });
    expect((await academics.listSubjects(b)).map((s) => s.name)).toEqual(['Science']);

    // the database itself (Row Level Security) hides the rows even without any application filter
    const rows = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.school_id', ${b}, true)`;
      return {
        entries: await tx.timetableEntry.findMany(),
        periods: await tx.period.findMany(),
        assignments: await tx.teachingAssignment.findMany(),
      };
    });
    expect(rows.entries).toHaveLength(0);
    expect(rows.periods).toHaveLength(0);
    expect(rows.assignments).toHaveLength(0);
    expect(await owner.timetableEntry.count({ where: { schoolId: a } })).toBeGreaterThan(0);
  });

  it('lists only active teaching staff for pickers and finds "my timetable" through the linked login', async () => {
    expect((await timetable.listTeachers(a)).map((t) => t.employeeNo)).toEqual(['T-1', 'T-2']); // not AD-1 (administrative) and not L-1 (left)
    expect((await timetable.listTeachers(b)).map((t) => t.employeeNo)).toEqual(['BT-1']);

    await expect(timetable.myTimetable(a, actor)).rejects.toMatchObject({ status: 404 }); // this login has no staff profile
    await owner.staff.update({ where: { id: ids.t2 }, data: { userId: actor } });
    const mine = await timetable.myTimetable(a, actor);
    expect(mine.staff.id).toBe(ids.t2);
    expect(mine.entries.every((e) => e.staff?.id === ids.t2)).toBe(true);
    await expect(timetable.myTimetable(b, actor)).rejects.toMatchObject({ status: 404 }); // other school: no link there
  });
});
