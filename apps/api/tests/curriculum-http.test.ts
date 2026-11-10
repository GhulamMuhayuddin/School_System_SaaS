import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AcademicsApi } from '../src/modules/academics/academics.types';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import type { TimetableApi } from '../src/modules/timetable/timetable.types';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const SCHOOL_B = '22222222-2222-4222-8222-222222222222';
const ID = '44444444-4444-4444-8444-444444444444';
const ID2 = '55555555-5555-4555-8555-555555555555';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = {
  viewer: ['academic.read'],
  planner: ['academic.read', 'academic.timetable.manage'],
  academic: ['academic.read', 'academic.manage'],
  sessions: ['academic.read', 'school.session.manage'],
  none: ['student.read'],
};
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A) => `Bearer ${(await tokens.sign({ userId: 'actor', schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const academics = {
    listSessions: rec('listSessions', []), createSession: rec('createSession'), updateSession: rec('updateSession'), setCurrentSession: rec('setCurrentSession'),
    deleteSession: rec('deleteSession'), listSubjects: rec('listSubjects', []), createSubject: rec('createSubject'), updateSubject: rec('updateSubject'),
    deleteSubject: rec('deleteSubject'), getClassSubjects: rec('getClassSubjects'), setClassSubjects: rec('setClassSubjects'),
  } as unknown as AcademicsApi;
  const timetable = {
    listPeriods: rec('listPeriods', []), createPeriod: rec('createPeriod'), updatePeriod: rec('updatePeriod'), deletePeriod: rec('deletePeriod'),
    listAssignments: rec('listAssignments', []), assign: rec('assign'), unassign: rec('unassign'), sectionTimetable: rec('sectionTimetable'),
    teacherTimetable: rec('teacherTimetable'), listTeachers: rec('listTeachers', []), myTimetable: rec('myTimetable'), setEntry: rec('setEntry'), deleteEntry: rec('deleteEntry'),
  } as unknown as TimetableApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    academics, timetable,
  });
  return { app, calls };
}

const call = async (app: ReturnType<typeof build>['app'], role: string, m: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, body?: object) =>
  (await request(app)[m](url).set('Authorization', await bearer(role)).send(body)).status;

describe('sessions, subjects and class subjects (/api/academics)', () => {
  it('splits permissions: reading, session management and academic management are separate', async () => {
    const { app } = build();
    const session = { name: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31' };
    expect(await call(app, 'none', 'get', '/api/academics/sessions')).toBe(403);
    expect(await call(app, 'viewer', 'get', '/api/academics/sessions')).toBe(200);
    expect(await call(app, 'viewer', 'post', '/api/academics/sessions', session)).toBe(403);
    expect(await call(app, 'academic', 'post', '/api/academics/sessions', session)).toBe(403); // sessions are not an academic.manage job
    expect(await call(app, 'sessions', 'post', '/api/academics/sessions', session)).toBe(201);
    expect(await call(app, 'sessions', 'post', `/api/academics/sessions/${ID}/current`)).toBe(200);
    expect(await call(app, 'sessions', 'delete', `/api/academics/sessions/${ID}`)).toBe(204);

    expect(await call(app, 'viewer', 'get', '/api/academics/subjects')).toBe(200);
    expect(await call(app, 'viewer', 'post', '/api/academics/subjects', { name: 'Maths' })).toBe(403);
    expect(await call(app, 'academic', 'post', '/api/academics/subjects', { name: 'Maths', code: '' })).toBe(201);
    expect(await call(app, 'academic', 'patch', `/api/academics/subjects/${ID}`, { code: 'MTH' })).toBe(200);
    expect(await call(app, 'academic', 'delete', `/api/academics/subjects/${ID}`)).toBe(204);
    expect(await call(app, 'viewer', 'get', `/api/academics/classes/${ID}/subjects`)).toBe(200);
    expect(await call(app, 'viewer', 'put', `/api/academics/classes/${ID}/subjects`, { subjectIds: [] })).toBe(403);
    expect(await call(app, 'academic', 'put', `/api/academics/classes/${ID}/subjects`, { subjectIds: [ID2] })).toBe(200);
  });

  it('validates sessions, subjects and class subject lists', async () => {
    const { app, calls } = build();
    const bad = (url: string, body: object, m: 'post' | 'patch' | 'put' = 'post') => call(app, 'sessions', m, url, body);
    expect(await bad('/api/academics/sessions', { name: 'x', startDate: '2026-04-01', endDate: '2026-03-31' })).toBe(400); // ends before it starts
    expect(await bad('/api/academics/sessions', { name: 'x', startDate: '2026-13-01', endDate: '2027-03-31' })).toBe(400); // not a date
    expect(await bad('/api/academics/sessions', { startDate: '2026-04-01', endDate: '2027-03-31' })).toBe(400);
    expect(await bad(`/api/academics/sessions/${ID}`, {}, 'patch')).toBe(400);
    expect(await call(app, 'academic', 'post', '/api/academics/subjects', { name: '' })).toBe(400);
    expect(await call(app, 'academic', 'put', `/api/academics/classes/${ID}/subjects`, { subjectIds: ['nope'] })).toBe(400);
    expect(await call(app, 'academic', 'put', `/api/academics/classes/${ID}/subjects`, {})).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe('timetable (/api/timetable)', () => {
  it('needs a school token', async () => {
    const { app, calls } = build();
    expect((await request(app).get('/api/timetable/periods')).status).toBe(401);
    expect((await request(app).get('/api/timetable/periods').set('Authorization', await bearer('viewer', null))).status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('lets teachers/viewers read, planners edit lessons and periods, and only academic managers assign teachers', async () => {
    const { app } = build();
    const period = { name: 'Period 1', startTime: '08:00', endTime: '08:40' };
    const entry = { sectionId: ID, dayOfWeek: 1, periodId: ID2, subjectId: ID };
    expect(await call(app, 'none', 'get', '/api/timetable/periods')).toBe(403);
    expect(await call(app, 'viewer', 'get', '/api/timetable/periods')).toBe(200);
    expect(await call(app, 'viewer', 'get', `/api/timetable/sections/${ID}`)).toBe(200);
    expect(await call(app, 'viewer', 'get', `/api/timetable/teachers/${ID}`)).toBe(200);
    expect(await call(app, 'viewer', 'get', '/api/timetable/assignments')).toBe(200);
    expect(await call(app, 'viewer', 'get', '/api/timetable/teachers')).toBe(200);
    expect(await call(app, 'viewer', 'get', '/api/timetable/my')).toBe(200);
    expect(await call(app, 'none', 'get', '/api/timetable/teachers')).toBe(403);
    expect(await call(app, 'none', 'get', '/api/timetable/my')).toBe(403);

    expect(await call(app, 'viewer', 'post', '/api/timetable/periods', period)).toBe(403);
    expect(await call(app, 'planner', 'post', '/api/timetable/periods', period)).toBe(201);
    expect(await call(app, 'planner', 'patch', `/api/timetable/periods/${ID}`, { isBreak: true })).toBe(200);
    expect(await call(app, 'planner', 'delete', `/api/timetable/periods/${ID}`)).toBe(204);
    expect(await call(app, 'viewer', 'put', '/api/timetable/entries', entry)).toBe(403);
    expect(await call(app, 'planner', 'put', '/api/timetable/entries', entry)).toBe(200);
    expect(await call(app, 'planner', 'delete', `/api/timetable/entries/${ID}`)).toBe(204);

    const assignment = { sectionId: ID, subjectId: ID2, staffId: ID };
    expect(await call(app, 'planner', 'post', '/api/timetable/assignments', assignment)).toBe(403); // planning lessons is not assigning teachers
    expect(await call(app, 'academic', 'post', '/api/timetable/assignments', assignment)).toBe(201);
    expect(await call(app, 'academic', 'delete', `/api/timetable/assignments/${ID}`)).toBe(204);
  });

  it('validates times, days and ids before touching the service', async () => {
    const { app, calls } = build();
    const send = (m: 'post' | 'patch' | 'put', url: string, body: object, role = 'planner') => call(app, role, m, url, body);
    expect(await send('post', '/api/timetable/periods', { name: 'P', startTime: '8:00', endTime: '09:00' })).toBe(400);
    expect(await send('post', '/api/timetable/periods', { name: 'P', startTime: '25:00', endTime: '26:00' })).toBe(400);
    expect(await send('post', '/api/timetable/periods', { name: 'P', startTime: '09:00', endTime: '08:00' })).toBe(400);
    expect(await send('post', '/api/timetable/periods', { name: '', startTime: '08:00', endTime: '09:00' })).toBe(400);
    expect(await send('patch', `/api/timetable/periods/${ID}`, {})).toBe(400);
    expect(await send('put', '/api/timetable/entries', { sectionId: ID, dayOfWeek: 8, periodId: ID, subjectId: ID })).toBe(400);
    expect(await send('put', '/api/timetable/entries', { sectionId: ID, dayOfWeek: 0, periodId: ID, subjectId: ID })).toBe(400);
    expect(await send('put', '/api/timetable/entries', { sectionId: 'x', dayOfWeek: 1, periodId: ID, subjectId: ID })).toBe(400);
    expect(await send('post', '/api/timetable/assignments', { sectionId: ID, subjectId: ID }, 'academic')).toBe(400);
    expect((await request(app).get('/api/timetable/sections/not-a-uuid').set('Authorization', await bearer('viewer'))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('uses the school from the token, never one sent by the client', async () => {
    const { app, calls } = build();
    const auth = await bearer('planner', SCHOOL_A);
    await request(app).put('/api/timetable/entries').set('Authorization', auth).send({ sectionId: ID, dayOfWeek: 2, periodId: ID, subjectId: ID, schoolId: SCHOOL_B });
    await request(app).get(`/api/timetable/sections/${ID}?schoolId=${SCHOOL_B}&sessionId=${ID2}`).set('Authorization', auth);
    expect(calls[0].args[0]).toBe(SCHOOL_A);
    expect(JSON.stringify(calls[0].args[1])).not.toContain(SCHOOL_B);
    expect(calls[1].args[0]).toBe(SCHOOL_A);
    expect(calls[1].args[2]).toBe(ID2); // the session filter is allowed; the school is not
  });

  it('"my timetable" is always about the signed-in user (the user id comes from the token)', async () => {
    const { app, calls } = build();
    await request(app).get(`/api/timetable/my?userId=${ID2}&sessionId=${ID}`).set('Authorization', await bearer('viewer'));
    expect(calls[0].name).toBe('myTimetable');
    expect(calls[0].args[0]).toBe(SCHOOL_A);
    expect(calls[0].args[1]).toBe('actor'); // the bearer's user id, not the one in the query string
    expect(calls[0].args[2]).toBe(ID);
  });
});
