import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import type { ExamsApi } from '../src/modules/exams/exams.types';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const ID = '44444444-4444-4444-8444-444444444444';
const ID2 = '55555555-5555-4555-8555-555555555555';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = {
  viewer: ['exam.read'],
  teacher: ['exam.read', 'exam.marks.enter'],
  manager: ['exam.read', 'exam.manage', 'exam.marks.enter'],
  publisher: ['exam.read', 'exam.result.publish'],
  none: ['student.read'],
};
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A, userId = 'actor') => `Bearer ${(await tokens.sign({ userId, schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const exams = {
    gradeBands: rec('bands'), setGradeBands: rec('setBands'), listExams: rec('list', []), createExam: rec('create'), getExam: rec('get'), updateExam: rec('update'),
    deleteExam: rec('delete'), setPapers: rec('setPapers'), paperMarks: rec('paperMarks'), saveMarks: rec('saveMarks'), classResults: rec('classResults'),
    studentResult: rec('studentResult'), publish: rec('publish'), unpublish: rec('unpublish'),
  } as unknown as ExamsApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    exams,
  });
  return { app, calls };
}
type Method = 'get' | 'put' | 'post' | 'patch' | 'delete';
const call = async (app: ReturnType<typeof build>['app'], role: string, m: Method, url: string, body?: object) =>
  (await request(app)[m](url).set('Authorization', await bearer(role)).send(body)).status;

describe('exam routes', () => {
  it('needs sign-in, a school and the right permission for each action', async () => {
    const { app } = build();
    expect((await request(app).get('/api/exams')).status).toBe(401);
    expect((await request(app).get('/api/exams').set('Authorization', await bearer('viewer', null))).status).toBe(403);
    expect(await call(app, 'none', 'get', '/api/exams')).toBe(403);
    expect(await call(app, 'viewer', 'get', '/api/exams')).toBe(200);
    expect(await call(app, 'viewer', 'get', `/api/exams/${ID}`)).toBe(200);
    expect(await call(app, 'viewer', 'post', '/api/exams', { name: 'Mid-Term' })).toBe(403);
    expect(await call(app, 'manager', 'post', '/api/exams', { name: 'Mid-Term' })).toBe(201);
    expect(await call(app, 'viewer', 'patch', `/api/exams/${ID}`, { name: 'Final' })).toBe(403);
    expect(await call(app, 'manager', 'patch', `/api/exams/${ID}`, { name: 'Final' })).toBe(200);
    expect(await call(app, 'manager', 'delete', `/api/exams/${ID}`)).toBe(204);
    expect(await call(app, 'viewer', 'get', '/api/exams/grade-bands')).toBe(200);
    expect(await call(app, 'viewer', 'put', '/api/exams/grade-bands', { bands: [{ grade: 'A', minPercent: 0 }] })).toBe(403);
    expect(await call(app, 'manager', 'put', '/api/exams/grade-bands', { bands: [{ grade: 'A', minPercent: 0 }] })).toBe(200);
  });

  it('lets teachers enter marks but not manage papers; only publishers publish', async () => {
    const { app } = build();
    const entries = [{ studentId: ID, marks: 45.5 }, { studentId: ID2, absent: true }];
    expect(await call(app, 'viewer', 'get', `/api/exams/papers/${ID}/marks`)).toBe(200);
    expect(await call(app, 'viewer', 'put', `/api/exams/papers/${ID}/marks`, { entries })).toBe(403);
    expect(await call(app, 'teacher', 'put', `/api/exams/papers/${ID}/marks`, { entries })).toBe(200);
    const papers = { papers: [{ subjectId: ID, totalMarks: 100, passMarks: 33 }] };
    expect(await call(app, 'teacher', 'put', `/api/exams/${ID}/classes/${ID2}/papers`, papers)).toBe(403);
    expect(await call(app, 'manager', 'put', `/api/exams/${ID}/classes/${ID2}/papers`, papers)).toBe(200);
    expect(await call(app, 'manager', 'post', `/api/exams/${ID}/publish`, {})).toBe(403);
    expect(await call(app, 'publisher', 'post', `/api/exams/${ID}/publish`, {})).toBe(200);
    expect(await call(app, 'publisher', 'post', `/api/exams/${ID}/unpublish`)).toBe(200);
    expect(await call(app, 'viewer', 'get', `/api/exams/${ID}/results?classId=${ID2}`)).toBe(200);
    expect(await call(app, 'viewer', 'get', `/api/exams/${ID}/students/${ID2}/result`)).toBe(200);
  });

  it('passes the school and caller from the token, with canManage from the role', async () => {
    const { app, calls } = build();
    const entries = [{ studentId: ID, marks: 10 }];
    await request(app).put(`/api/exams/papers/${ID}/marks`).set('Authorization', await bearer('teacher', SCHOOL_A, 'u-teacher')).send({ entries });
    await request(app).put(`/api/exams/papers/${ID}/marks`).set('Authorization', await bearer('manager', SCHOOL_A, 'u-boss')).send({ entries });
    const saves = calls.filter((c) => c.name === 'saveMarks');
    expect(saves[0].args[0]).toBe(SCHOOL_A);
    expect(saves[0].args[3]).toEqual({ userId: 'u-teacher', canManage: false });
    expect(saves[1].args[3]).toEqual({ userId: 'u-boss', canManage: true });
  });

  it('rejects bad input before it reaches the service', async () => {
    const { app, calls } = build();
    const put = (body: object) => call(app, 'teacher', 'put', `/api/exams/papers/${ID}/marks`, body);
    expect(await put({ entries: [] })).toBe(400);
    expect(await put({ entries: [{ studentId: 'nope', marks: 5 }] })).toBe(400);
    expect(await put({ entries: [{ studentId: ID, marks: -1 }] })).toBe(400);
    expect(await put({ entries: [{ studentId: ID, marks: 5.555 }] })).toBe(400);
    expect(await put({ entries: [{ studentId: ID, marks: 5, absent: true }] })).toBe(400);
    expect(await call(app, 'manager', 'post', '/api/exams', { name: 'x' })).toBe(400);
    expect(await call(app, 'manager', 'post', '/api/exams', { name: 'Mid-Term', startDate: '2026-13-01' })).toBe(400);
    expect(await call(app, 'manager', 'post', '/api/exams', { name: 'Mid-Term', startDate: '2026-06-10', endDate: '2026-06-01' })).toBe(400);
    expect(await call(app, 'manager', 'put', `/api/exams/${ID}/classes/${ID2}/papers`, { papers: [{ subjectId: ID, totalMarks: 50, passMarks: 60 }] })).toBe(400);
    expect(await call(app, 'manager', 'get', '/api/exams/not-a-uuid')).toBe(400);
    expect(await call(app, 'viewer', 'get', `/api/exams/${ID}/results`)).toBe(400); // classId required
    expect(calls.filter((c) => ['saveMarks', 'createExam', 'setPapers'].includes(c.name))).toHaveLength(0);
  });
});
