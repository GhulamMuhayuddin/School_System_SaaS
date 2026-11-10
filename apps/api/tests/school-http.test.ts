import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import type { SchoolApi } from '../src/modules/school/school.types';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const SCHOOL_B = '22222222-2222-4222-8222-222222222222';
const ROLE = '55555555-5555-4555-8555-555555555555';
const USER = '66666666-6666-4666-8666-666666666666';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = {
  admin: ['school.settings.manage', 'school.role.manage', 'school.audit.view'],
  principal: ['school.audit.view', 'report.view'],
  teacher: ['student.read'],
  super: ['platform.school.manage'],
};
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A) =>
  `Bearer ${(await tokens.sign({ userId: 'actor', schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const school = {
    overview: rec('overview'), letterhead: rec('letterhead', {}), getProfile: rec('getProfile'), updateProfile: rec('updateProfile'), listUsers: rec('listUsers', []),
    createUser: rec('createUser'), createStudentAccount: rec('createStudentAccount'), updateUser: rec('updateUser'), setUserStatus: rec('setUserStatus'), listAuditLogs: rec('listAuditLogs', []),
  } as unknown as SchoolApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    school,
  });
  return { app, calls };
}

describe('/api/school access control', () => {
  it('requires a token and a school in the token', async () => {
    const { app, calls } = build();
    expect((await request(app).get('/api/school/overview')).status).toBe(401);
    expect((await request(app).get('/api/school/overview').set('Authorization', await bearer('super', null))).status).toBe(403);
    expect(calls).toHaveLength(0);
  });
  it('gives each role only what its permissions allow', async () => {
    const { app } = build();
    const get = async (role: string, url: string) => (await request(app).get(url).set('Authorization', await bearer(role))).status;
    expect(await get('teacher', '/api/school/overview')).toBe(403);
    expect(await get('principal', '/api/school/overview')).toBe(200);
    expect(await get('principal', '/api/school/audit-logs')).toBe(200);
    expect(await get('principal', '/api/school/users')).toBe(403);
    expect(await get('principal', '/api/school/profile')).toBe(403);
    expect(await get('admin', '/api/school/users')).toBe(200);
    expect(await get('admin', '/api/school/profile')).toBe(200);
  });
  it('always uses the school from the token, never one sent by the client', async () => {
    const { app, calls } = build();
    const auth = await bearer('admin', SCHOOL_A);
    await request(app).get(`/api/school/users?schoolId=${SCHOOL_B}`).set('Authorization', auth);
    await request(app).patch('/api/school/profile').set('Authorization', auth).send({ name: 'X', schoolId: SCHOOL_B });
    expect(calls[0].args[0]).toBe(SCHOOL_A);
    expect(calls[1].args[0]).toBe(SCHOOL_A);
    expect(JSON.stringify(calls[1].args[1])).not.toContain(SCHOOL_B);
  });
});

describe('/api/school validation', () => {
  it('validates user creation, updates, status and profile', async () => {
    const { app, calls } = build();
    const auth = await bearer('admin');
    const send = (m: 'post' | 'patch', url: string, body: object) => request(app)[m](url).set('Authorization', auth).send(body);
    const good = { firstName: 'Ali', lastName: 'Khan', email: 'ALI@School.test', roleId: ROLE, password: 'long-enough-pw' };
    expect((await send('post', '/api/school/users', { ...good, password: 'short' })).status).toBe(400);
    expect((await send('post', '/api/school/users', { ...good, roleId: 'x' })).status).toBe(400);
    expect((await send('post', '/api/school/users', { ...good, email: 'nope' })).status).toBe(400);
    expect(calls).toHaveLength(0);
    expect((await send('post', '/api/school/users', good)).status).toBe(201);
    expect((calls[0].args[1] as { email: string }).email).toBe('ali@school.test');
    expect((await send('patch', `/api/school/users/${USER}`, {})).status).toBe(400);
    expect((await send('patch', `/api/school/users/${USER}`, { roleId: ROLE })).status).toBe(200);
    expect((await send('post', `/api/school/users/${USER}/status`, { status: 'LOCKED' })).status).toBe(400);
    expect((await send('post', `/api/school/users/${USER}/status`, { status: 'INACTIVE' })).status).toBe(200);
    expect((await send('patch', '/api/school/profile', {})).status).toBe(400);
    expect((await send('patch', '/api/school/profile', { email: 'bad' })).status).toBe(400);
    expect((await send('patch', '/api/school/profile', { name: 'New Name', email: '' })).status).toBe(200);
    expect(calls.at(-1)!.args[1]).toMatchObject({ name: 'New Name', email: null });
    expect((await request(app).get('/api/school/audit-logs?limit=9999').set('Authorization', auth)).status).toBe(400);
  });
});

describe('POST /api/school/students/:id/account', () => {
  const SID = '44444444-4444-4444-8444-444444444444';
  const body = { email: 'kid@example.test', password: 'long-enough-pass-1' };
  it('needs school.role.manage, validates input and uses ids from the token', async () => {
    const { app, calls } = build();
    const post = async (role: string, url: string, b: object) => (await request(app).post(url).set('Authorization', await bearer(role)).send(b)).status;
    expect(await post('principal', `/api/school/students/${SID}/account`, body)).toBe(403);
    expect(await post('admin', '/api/school/students/not-a-uuid/account', body)).toBe(400);
    expect(await post('admin', `/api/school/students/${SID}/account`, { ...body, password: 'short' })).toBe(400);
    expect(await post('admin', `/api/school/students/${SID}/account`, { ...body, email: 'nope' })).toBe(400);
    expect(calls).toHaveLength(0);
    expect(await post('admin', `/api/school/students/${SID}/account`, { ...body, schoolId: SCHOOL_B })).toBe(201);
    expect(calls[0]!.args[0]).toBe(SCHOOL_A);
    expect(calls[0]!.args[1]).toBe(SID);
  });
});

describe('GET /api/school/letterhead', () => {
  it('is open to any signed-in member of a school, never to anonymous or school-less tokens', async () => {
    const { app, calls } = build();
    expect((await request(app).get('/api/school/letterhead')).status).toBe(401);
    expect((await request(app).get('/api/school/letterhead').set('Authorization', await bearer('teacher', null))).status).toBe(403);
    expect((await request(app).get('/api/school/letterhead').set('Authorization', await bearer('teacher'))).status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toEqual([SCHOOL_A]);
  });
});
