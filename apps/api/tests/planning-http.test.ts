import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import type { CalendarApi } from '../src/modules/calendar/calendar.types';
import type { SyllabusApi } from '../src/modules/syllabus/syllabus.types';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const SCHOOL_B = '22222222-2222-4222-8222-222222222222';
const ID = '44444444-4444-4444-8444-444444444444';
const ID2 = '55555555-5555-4555-8555-555555555555';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = { viewer: ['academic.read'], manager: ['academic.read', 'academic.manage'], none: ['student.read'] };
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A) => `Bearer ${(await tokens.sign({ userId: 'actor', schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const calendar = { list: rec('cal.list', []), create: rec('cal.create'), update: rec('cal.update'), remove: rec('cal.remove') } as unknown as CalendarApi;
  const syllabus = {
    list: rec('syl.list'), summary: rec('syl.summary'), create: rec('syl.create'), update: rec('syl.update'),
    setStatus: rec('syl.status'), move: rec('syl.move', []), remove: rec('syl.remove'),
  } as unknown as SyllabusApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    calendar, syllabus,
  });
  return { app, calls };
}
const call = async (app: ReturnType<typeof build>['app'], role: string, m: 'get' | 'post' | 'patch' | 'delete', url: string, body?: object) =>
  (await request(app)[m](url).set('Authorization', await bearer(role)).send(body)).status;

describe('academic calendar (/api/calendar)', () => {
  it('lets every academic reader see events but only academic managers change them', async () => {
    const { app } = build();
    const event = { title: 'Eid break', type: 'HOLIDAY', startDate: '2026-03-20', endDate: '2026-03-24' };
    expect((await request(app).get('/api/calendar/events')).status).toBe(401);
    expect(await call(app, 'none', 'get', '/api/calendar/events')).toBe(403);
    expect(await call(app, 'viewer', 'get', '/api/calendar/events')).toBe(200);
    expect(await call(app, 'viewer', 'post', '/api/calendar/events', event)).toBe(403);
    expect(await call(app, 'manager', 'post', '/api/calendar/events', event)).toBe(201);
    expect(await call(app, 'viewer', 'patch', `/api/calendar/events/${ID}`, { title: 'x' })).toBe(403);
    expect(await call(app, 'manager', 'patch', `/api/calendar/events/${ID}`, { title: 'Eid holidays' })).toBe(200);
    expect(await call(app, 'viewer', 'delete', `/api/calendar/events/${ID}`)).toBe(403);
    expect(await call(app, 'manager', 'delete', `/api/calendar/events/${ID}`)).toBe(204);
    expect((await request(app).get('/api/calendar/events').set('Authorization', await bearer('viewer', null))).status).toBe(403); // platform user
  });

  it('validates dates, types and the requested range before calling the service', async () => {
    const { app, calls } = build();
    const bad = (body: object) => call(app, 'manager', 'post', '/api/calendar/events', body);
    expect(await bad({ title: '', type: 'HOLIDAY', startDate: '2026-03-20' })).toBe(400);
    expect(await bad({ title: 'x', type: 'PARTY', startDate: '2026-03-20' })).toBe(400);
    expect(await bad({ title: 'x', type: 'EVENT', startDate: '2026-02-30' })).toBe(400);
    expect(await bad({ title: 'x', type: 'EVENT', startDate: '2026-03-20', endDate: '2026-03-19' })).toBe(400);
    expect(await call(app, 'manager', 'patch', `/api/calendar/events/${ID}`, {})).toBe(400);
    expect(await call(app, 'viewer', 'get', '/api/calendar/events?from=2026-05-01&to=2026-04-01')).toBe(400);
    expect(await call(app, 'viewer', 'get', '/api/calendar/events?from=2024-01-01&to=2026-12-31')).toBe(400); // more than 400 days
    expect(await call(app, 'viewer', 'get', '/api/calendar/events?from=nope')).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('defaults the range to the current month and uses the school from the token', async () => {
    const { app, calls } = build();
    await request(app).get(`/api/calendar/events?schoolId=${SCHOOL_B}`).set('Authorization', await bearer('viewer'));
    expect(calls[0].args[0]).toBe(SCHOOL_A);
    const range = calls[0].args[1] as { from: string; to: string };
    expect(range.from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(range.to >= range.from).toBe(true);
    expect(range.to.slice(0, 7)).toBe(range.from.slice(0, 7)); // same month
  });
});

describe('syllabus (/api/syllabus)', () => {
  it('lets readers view and only academic managers change topics', async () => {
    const { app } = build();
    const list = `/api/syllabus/topics?classId=${ID}&subjectId=${ID2}`;
    expect(await call(app, 'none', 'get', list)).toBe(403);
    expect(await call(app, 'viewer', 'get', list)).toBe(200);
    expect(await call(app, 'viewer', 'get', `/api/syllabus/summary?classId=${ID}`)).toBe(200);
    const topic = { classId: ID, subjectId: ID2, title: 'Fractions' };
    expect(await call(app, 'viewer', 'post', '/api/syllabus/topics', topic)).toBe(403);
    expect(await call(app, 'manager', 'post', '/api/syllabus/topics', topic)).toBe(201);
    expect(await call(app, 'viewer', 'post', `/api/syllabus/topics/${ID}/status`, { status: 'COMPLETED' })).toBe(403);
    expect(await call(app, 'manager', 'post', `/api/syllabus/topics/${ID}/status`, { status: 'COMPLETED' })).toBe(200);
    expect(await call(app, 'manager', 'post', `/api/syllabus/topics/${ID}/move`, { direction: 'up' })).toBe(200);
    expect(await call(app, 'manager', 'patch', `/api/syllabus/topics/${ID}`, { title: 'Decimals' })).toBe(200);
    expect(await call(app, 'viewer', 'delete', `/api/syllabus/topics/${ID}`)).toBe(403);
    expect(await call(app, 'manager', 'delete', `/api/syllabus/topics/${ID}`)).toBe(204);
  });

  it('validates ids, titles, status and direction', async () => {
    const { app, calls } = build();
    expect(await call(app, 'viewer', 'get', '/api/syllabus/topics')).toBe(400); // class and subject are required
    expect(await call(app, 'viewer', 'get', `/api/syllabus/topics?classId=nope&subjectId=${ID}`)).toBe(400);
    expect(await call(app, 'manager', 'post', '/api/syllabus/topics', { classId: ID, subjectId: ID2, title: '' })).toBe(400);
    expect(await call(app, 'manager', 'post', '/api/syllabus/topics', { classId: ID, subjectId: ID2, title: 'x'.repeat(161) })).toBe(400);
    expect(await call(app, 'manager', 'post', `/api/syllabus/topics/${ID}/status`, { status: 'DONE' })).toBe(400);
    expect(await call(app, 'manager', 'post', `/api/syllabus/topics/${ID}/move`, { direction: 'left' })).toBe(400);
    expect(await call(app, 'manager', 'patch', `/api/syllabus/topics/${ID}`, {})).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('uses the school from the token, never from the client', async () => {
    const { app, calls } = build();
    await request(app).post('/api/syllabus/topics').set('Authorization', await bearer('manager')).send({ classId: ID, subjectId: ID2, title: 'T', schoolId: SCHOOL_B });
    expect(calls[0].args[0]).toBe(SCHOOL_A);
    expect(JSON.stringify(calls[0].args[1])).not.toContain(SCHOOL_B);
  });
});
