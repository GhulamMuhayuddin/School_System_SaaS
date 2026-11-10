import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AttendanceApi } from '../src/modules/attendance/attendance.types';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const SCHOOL_B = '22222222-2222-4222-8222-222222222222';
const ID = '44444444-4444-4444-8444-444444444444';
const ID2 = '55555555-5555-4555-8555-555555555555';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = {
  viewer: ['attendance.read'],
  teacher: ['attendance.read', 'attendance.mark'],
  corrector: ['attendance.read', 'attendance.mark', 'attendance.correct'],
  hr: ['staff.attendance'],
  none: ['student.read'],
};
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A, userId = 'actor') => `Bearer ${(await tokens.sign({ userId, schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const attendance = {
    sectionRoster: rec('roster'), markStudents: rec('mark'), sectionMonthly: rec('monthly'), studentHistory: rec('history'),
    studentReport: rec('report'), staffRoster: rec('staffRoster'), markStaff: rec('markStaff'), staffMonthly: rec('staffMonthly'),
  } as unknown as AttendanceApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    attendance,
  });
  return { app, calls };
}
const call = async (app: ReturnType<typeof build>['app'], role: string, m: 'get' | 'put', url: string, body?: object) =>
  (await request(app)[m](url).set('Authorization', await bearer(role)).send(body)).status;

const entries = [{ studentId: ID, status: 'PRESENT' }, { studentId: ID2, status: 'ABSENT', remark: 'sick' }];

describe('student attendance routes', () => {
  it('lets readers look, teachers mark, and nobody without the permission in', async () => {
    const { app } = build();
    const roster = `/api/attendance/students/sections/${ID}?date=2026-06-15`;
    expect((await request(app).get(roster)).status).toBe(401);
    expect(await call(app, 'none', 'get', roster)).toBe(403);
    expect(await call(app, 'viewer', 'get', roster)).toBe(200);
    expect(await call(app, 'viewer', 'put', `/api/attendance/students/sections/${ID}`, { date: '2026-06-15', entries })).toBe(403);
    expect(await call(app, 'teacher', 'put', `/api/attendance/students/sections/${ID}`, { date: '2026-06-15', entries })).toBe(200);
    expect(await call(app, 'viewer', 'get', `/api/attendance/students/sections/${ID}/monthly?month=2026-06`)).toBe(200);
    expect(await call(app, 'viewer', 'get', `/api/attendance/students/${ID}/history?from=2026-06-01&to=2026-06-30`)).toBe(200);
    expect(await call(app, 'viewer', 'get', '/api/attendance/reports/students?from=2026-06-01&to=2026-06-30&below=75')).toBe(200);
    expect((await request(app).get(roster).set('Authorization', await bearer('viewer', null))).status).toBe(403); // platform user
  });

  it('tells the service whether the caller may correct attendance, using the role from the token', async () => {
    const { app, calls } = build();
    const body = { date: '2026-06-15', entries };
    await request(app).put(`/api/attendance/students/sections/${ID}`).set('Authorization', await bearer('teacher', SCHOOL_A, 'u-teacher')).send(body);
    await request(app).put(`/api/attendance/students/sections/${ID}`).set('Authorization', await bearer('corrector', SCHOOL_A, 'u-boss')).send(body);
    expect(calls[0].args[3]).toEqual({ userId: 'u-teacher', canCorrect: false });
    expect(calls[1].args[3]).toEqual({ userId: 'u-boss', canCorrect: true });
  });

  it('validates dates, statuses, lists and ranges before calling the service', async () => {
    const { app, calls } = build();
    const put = (body: object) => call(app, 'teacher', 'put', `/api/attendance/students/sections/${ID}`, body);
    expect(await put({ date: '2026-02-30', entries })).toBe(400);
    expect(await put({ date: '2026-13-01', entries })).toBe(400); // an impossible month used to crash with 500
    expect(await call(app, 'teacher', 'get', `/api/attendance/students/sections/${ID}?date=2026-13-45`)).toBe(400);
    expect(await put({ date: '2026-06-15', entries: [] })).toBe(400);
    expect(await put({ date: '2026-06-15', entries: [{ studentId: ID, status: 'SICK' }] })).toBe(400);
    expect(await put({ date: '2026-06-15', entries: [{ studentId: 'x', status: 'PRESENT' }] })).toBe(400);
    expect(await put({ date: '2026-06-15', entries: Array.from({ length: 201 }, () => ({ studentId: ID, status: 'PRESENT' })) })).toBe(400);
    expect(await call(app, 'viewer', 'get', `/api/attendance/students/sections/${ID}/monthly?month=2026-13`)).toBe(400);
    expect(await call(app, 'viewer', 'get', `/api/attendance/students/sections/${ID}/monthly`)).toBe(400);
    expect(await call(app, 'viewer', 'get', `/api/attendance/students/${ID}/history?from=2026-06-10&to=2026-06-01`)).toBe(400);
    expect(await call(app, 'viewer', 'get', `/api/attendance/students/${ID}/history?from=2024-01-01&to=2026-06-01`)).toBe(400); // over 366 days
    expect(await call(app, 'viewer', 'get', '/api/attendance/reports/students?from=2026-06-01&to=2026-06-30&below=0')).toBe(400);
    expect(await call(app, 'viewer', 'get', '/api/attendance/reports/students?from=2026-06-01&to=2026-06-30&limit=501')).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('uses the school and the filters from the token and the validated query, never from the client body', async () => {
    const { app, calls } = build();
    await request(app).put(`/api/attendance/students/sections/${ID}`).set('Authorization', await bearer('teacher')).send({ date: '2026-06-15', entries, schoolId: SCHOOL_B });
    expect(calls[0].args[0]).toBe(SCHOOL_A);
    expect(JSON.stringify(calls[0].args[2])).not.toContain(SCHOOL_B);
    await request(app).get(`/api/attendance/reports/students?from=2026-06-01&to=2026-06-30&schoolId=${SCHOOL_B}`).set('Authorization', await bearer('viewer'));
    expect(calls[1].args[0]).toBe(SCHOOL_A);
    expect(calls[1].args[1]).toMatchObject({ from: '2026-06-01', to: '2026-06-30', limit: 200 }); // default limit
  });
});

describe('staff attendance routes', () => {
  it('need the staff.attendance permission for reading and marking', async () => {
    const { app } = build();
    const mark = { date: '2026-06-15', entries: [{ staffId: ID, status: 'LATE' }] };
    expect(await call(app, 'viewer', 'get', '/api/attendance/staff')).toBe(403); // reading student attendance is not enough
    expect(await call(app, 'teacher', 'put', '/api/attendance/staff', mark)).toBe(403);
    expect(await call(app, 'hr', 'get', '/api/attendance/staff?date=2026-06-15')).toBe(200);
    expect(await call(app, 'hr', 'put', '/api/attendance/staff', mark)).toBe(200);
    expect(await call(app, 'hr', 'get', '/api/attendance/staff/monthly?month=2026-06')).toBe(200);
    expect(await call(app, 'hr', 'put', '/api/attendance/staff', { date: '2026-06-15', entries: [] })).toBe(400);
    expect(await call(app, 'hr', 'put', '/api/attendance/staff', { date: '2026-06-15', entries: [{ staffId: 'x', status: 'LATE' }] })).toBe(400);
  });
});
