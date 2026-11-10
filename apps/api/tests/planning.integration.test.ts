/**
 * Real database test of Phase 7C: academic calendar and syllabus (progress, ordering, guards, isolation).
 * Needs the Phase 7C migration, `pnpm db:rls`, `pnpm db:seed`. Run:  set RUN_DB_TESTS=1  then  pnpm --filter @nexora/api test
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AcademicsService } from '../src/modules/academics/academics.service';
import { CalendarService } from '../src/modules/calendar/calendar.service';
import { SyllabusService } from '../src/modules/syllabus/syllabus.service';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('calendar and syllabus (PostgreSQL)', () => {
  let owner: PrismaClient;
  let runtime: PrismaClient;
  let academics: AcademicsService;
  let calendar: CalendarService;
  let syllabus: SyllabusService;
  const tag = `plan-${Date.now()}`;
  let a = '';
  let b = '';
  let actor = '';
  const ids = { classId: '', math: '', english: '', art: '', session: '' };

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    academics = new AcademicsService(runtime);
    calendar = new CalendarService(runtime);
    syllabus = new SyllabusService(runtime);
    const admin = await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'school_admin' } });
    a = (await owner.school.create({ data: { name: `${tag} A`, code: `${tag}-a` } })).id;
    b = (await owner.school.create({ data: { name: `${tag} B`, code: `${tag}-b` } })).id;
    actor = (await owner.user.create({ data: { schoolId: a, roleId: admin.id, email: `${tag}@example.test`, passwordHash: 'x', firstName: 'A', lastName: 'A' } })).id;

    ids.session = (await academics.createSession(a, { name: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31' }, actor)).id;
    ids.classId = (await academics.createClass(a, { name: 'Class 6', level: 6 }, actor)).id;
    ids.math = (await academics.createSubject(a, { name: 'Mathematics' }, actor)).id;
    ids.english = (await academics.createSubject(a, { name: 'English' }, actor)).id;
    ids.art = (await academics.createSubject(a, { name: 'Art' }, actor)).id; // not taught in Class 6
    await academics.setClassSubjects(a, ids.classId, [ids.math, ids.english], actor);
  });

  afterAll(async () => {
    if (!owner) return;
    for (const id of [a, b]) {
      await owner.auditLog.deleteMany({ where: { schoolId: id } });
      await owner.user.deleteMany({ where: { schoolId: id } });
      await owner.school.deleteMany({ where: { id } }); // events, topics, sessions ... cascade
    }
    await owner.$disconnect();
    await runtime.$disconnect();
  });

  it('keeps calendar events, finds those that touch a date range, and validates changes', async () => {
    const eid = await calendar.create(a, { title: 'Eid break', type: 'HOLIDAY', startDate: '2026-03-20', endDate: '2026-03-24' }, actor);
    const sports = await calendar.create(a, { title: 'Sports day', type: 'EVENT', startDate: '2026-03-30' }, actor);
    await calendar.create(a, { title: 'Midterm exams', type: 'EXAM', startDate: '2026-05-05', endDate: '2026-05-12', description: 'All classes' }, actor);
    expect(sports.endDate).toBe('2026-03-30'); // one-day event ends the same day

    const march = await calendar.list(a, { from: '2026-03-01', to: '2026-03-31' });
    expect(march.map((e) => e.title)).toEqual(['Eid break', 'Sports day']);
    // an event that starts before the range but runs into it is included
    expect((await calendar.list(a, { from: '2026-03-23', to: '2026-03-25' })).map((e) => e.title)).toEqual(['Eid break']);
    expect(await calendar.list(a, { from: '2026-06-01', to: '2026-06-30' })).toEqual([]);

    const moved = await calendar.update(a, eid.id, { title: 'Eid holidays', endDate: '2026-03-25' }, actor);
    expect(moved.title).toBe('Eid holidays');
    expect(moved.endDate).toBe('2026-03-25');
    expect(moved.startDate).toBe('2026-03-20');
    await expect(calendar.update(a, eid.id, { endDate: '2026-03-10' }, actor)).rejects.toMatchObject({ status: 400 });
    await expect(calendar.update(a, randomUUID(), { title: 'x' }, actor)).rejects.toMatchObject({ status: 404 });
    await calendar.remove(a, sports.id, actor);
    expect((await calendar.list(a, { from: '2026-03-01', to: '2026-03-31' })).map((e) => e.title)).toEqual(['Eid holidays']);
  });

  it('hides one school\'s calendar from another school', async () => {
    const mine = await calendar.list(a, { from: '2026-01-01', to: '2026-12-31' });
    expect(mine.length).toBeGreaterThan(0);
    expect(await calendar.list(b, { from: '2026-01-01', to: '2026-12-31' })).toEqual([]);
    await expect(calendar.update(b, mine[0].id, { title: 'hacked' }, actor)).rejects.toMatchObject({ status: 404 });
    await expect(calendar.remove(b, mine[0].id, actor)).rejects.toMatchObject({ status: 404 });
    const rows = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.school_id', ${b}, true)`;
      return tx.calendarEvent.findMany();
    });
    expect(rows).toHaveLength(0); // Row Level Security, with no application filter
  });

  it('adds syllabus topics in order, only for subjects the class studies, without duplicates', async () => {
    const t1 = await syllabus.create(a, { classId: ids.classId, subjectId: ids.math, title: 'Whole numbers' }, actor);
    const t2 = await syllabus.create(a, { classId: ids.classId, subjectId: ids.math, title: 'Fractions', description: 'Add and subtract' }, actor);
    const t3 = await syllabus.create(a, { classId: ids.classId, subjectId: ids.math, title: 'Decimals' }, actor);
    expect([t1.sortOrder, t2.sortOrder, t3.sortOrder]).toEqual([1, 2, 3]);
    await expect(syllabus.create(a, { classId: ids.classId, subjectId: ids.math, title: 'Fractions' }, actor)).rejects.toMatchObject({ status: 409 });
    await expect(syllabus.create(a, { classId: ids.classId, subjectId: ids.art, title: 'Colours' }, actor)).rejects.toMatchObject({ status: 400 });
    await expect(syllabus.create(a, { classId: randomUUID(), subjectId: ids.math, title: 'X' }, actor)).rejects.toMatchObject({ status: 404 });

    const list = await syllabus.list(a, { classId: ids.classId, subjectId: ids.math });
    expect(list.subject.name).toBe('Mathematics');
    expect(list.topics.map((t) => t.title)).toEqual(['Whole numbers', 'Fractions', 'Decimals']);
    expect(list.progress).toEqual({ total: 3, completed: 0, inProgress: 0 });
  });

  it('tracks progress, sets completion time, renames and reorders topics', async () => {
    const [first, second, third] = (await syllabus.list(a, { classId: ids.classId, subjectId: ids.math })).topics;
    expect((await syllabus.setStatus(a, first.id, 'COMPLETED', actor)).completedAt).not.toBeNull();
    expect((await syllabus.setStatus(a, second.id, 'IN_PROGRESS', actor)).completedAt).toBeNull();
    const reopened = await syllabus.setStatus(a, first.id, 'IN_PROGRESS', actor);
    expect(reopened.completedAt).toBeNull(); // un-completing clears the date
    await syllabus.setStatus(a, first.id, 'COMPLETED', actor);

    expect((await syllabus.update(a, third.id, { title: 'Decimals and percentages' }, actor)).title).toBe('Decimals and percentages');
    await expect(syllabus.update(a, third.id, { title: 'Fractions' }, actor)).rejects.toMatchObject({ status: 409 });

    const afterUp = await syllabus.move(a, third.id, 'up', actor);
    expect(afterUp.map((t) => t.title)).toEqual(['Whole numbers', 'Decimals and percentages', 'Fractions']);
    expect(afterUp.map((t) => t.sortOrder)).toEqual([1, 2, 3]);
    const stillFirst = await syllabus.move(a, first.id, 'up', actor); // already first: nothing changes
    expect(stillFirst[0].id).toBe(first.id);
    expect((await syllabus.move(a, first.id, 'down', actor)).map((t) => t.title)).toEqual(['Decimals and percentages', 'Whole numbers', 'Fractions']);

    const list = await syllabus.list(a, { classId: ids.classId, subjectId: ids.math });
    expect(list.progress).toEqual({ total: 3, completed: 1, inProgress: 1 });
  });

  it('summarises progress for every subject of a class, including subjects with no topics', async () => {
    const summary = await syllabus.summary(a, ids.classId);
    expect(summary.subjects.map((s) => s.subject.name)).toEqual(['English', 'Mathematics']);
    expect(summary.subjects.find((s) => s.subject.name === 'English')?.progress).toEqual({ total: 0, completed: 0, inProgress: 0 });
    expect(summary.subjects.find((s) => s.subject.name === 'Mathematics')?.progress).toEqual({ total: 3, completed: 1, inProgress: 1 });
  });

  it('stops other screens from deleting things the syllabus still uses', async () => {
    await expect(academics.setClassSubjects(a, ids.classId, [ids.english], actor)).rejects.toMatchObject({ status: 409 }); // would drop Maths
    await expect(academics.deleteSubject(a, ids.math, actor)).rejects.toMatchObject({ status: 409 });
    const other = await academics.createSession(a, { name: '2027-2028', startDate: '2027-04-01', endDate: '2028-03-31' }, actor);
    await expect(academics.deleteSession(a, ids.session, actor)).rejects.toMatchObject({ status: 409 }); // current anyway
    await academics.setCurrentSession(a, other.id, actor);
    await expect(academics.deleteSession(a, ids.session, actor)).rejects.toMatchObject({ status: 409 }); // holds topics
    // the new session has its own, empty syllabus
    expect((await syllabus.list(a, { classId: ids.classId, subjectId: ids.math })).topics).toEqual([]);
    expect((await syllabus.list(a, { classId: ids.classId, subjectId: ids.math, sessionId: ids.session })).topics).toHaveLength(3);
  });

  it('deletes a topic and keeps the other school out of this one\'s syllabus', async () => {
    const topics = (await syllabus.list(a, { classId: ids.classId, subjectId: ids.math, sessionId: ids.session })).topics;
    await academics.createSession(b, { name: 'B-2026', startDate: '2026-04-01', endDate: '2027-03-31' }, actor);
    await expect(syllabus.list(b, { classId: ids.classId, subjectId: ids.math })).rejects.toMatchObject({ status: 404 }); // class is not theirs
    await expect(syllabus.setStatus(b, topics[0].id, 'COMPLETED', actor)).rejects.toMatchObject({ status: 404 });
    await expect(syllabus.move(b, topics[0].id, 'up', actor)).rejects.toMatchObject({ status: 404 });
    await expect(syllabus.remove(b, topics[0].id, actor)).rejects.toMatchObject({ status: 404 });
    const rows = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.school_id', ${b}, true)`;
      return tx.syllabusTopic.findMany();
    });
    expect(rows).toHaveLength(0);

    await syllabus.remove(a, topics[0].id, actor);
    expect((await syllabus.list(a, { classId: ids.classId, subjectId: ids.math, sessionId: ids.session })).topics).toHaveLength(2);
  });
});
