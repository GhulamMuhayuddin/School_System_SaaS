import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AdmissionsApi } from '../src/modules/admissions/admissions.types';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import type { PortalApi } from '../src/modules/portal/portal.service';
import type { SchoolApi } from '../src/modules/school/school.types';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const SCHOOL_B = '22222222-2222-4222-8222-222222222222';
const CLASS = '33333333-3333-4333-8333-333333333333';
const APP = '44444444-4444-4444-8444-444444444444';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = {
  officer: ['admission.read', 'admission.create', 'admission.update', 'student.read'],
  principal: ['admission.read', 'admission.approve'],
  reception: ['admission.read', 'admission.create'],
  admin: ['admission.read', 'admission.create', 'admission.update', 'admission.approve', 'school.role.manage'],
  parent: ['portal.own.read'],
  teacher: ['student.read'],
};
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A, userId = 'actor') =>
  `Bearer ${(await tokens.sign({ userId, schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const admissions = {
    list: rec('list', { applications: [], total: 0 }), get: rec('get'), create: rec('create'), update: rec('update'),
    approve: rec('approve', { application: {}, student: {} }), reject: rec('reject'),
  } as unknown as AdmissionsApi;
  const portal = { children: rec('children', { guardianName: null, children: [] }) } as unknown as PortalApi;
  const school = { createGuardianAccount: rec('createGuardianAccount') } as unknown as SchoolApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    admissions, portal, school,
  });
  return { app, calls };
}

const good = {
  firstName: 'Ali', lastName: 'Khan', gender: 'MALE', dateOfBirth: '2018-03-01', appliedClassId: CLASS,
  guardianName: 'Ahmed Khan', guardianPhone: '0300-1234567', guardianRelation: 'FATHER',
};

describe('/api/admissions', () => {
  it('splits permissions: receptionist can only create, officer cannot decide, only an approver approves', async () => {
    const { app } = build();
    const call = async (role: string, m: 'get' | 'post' | 'patch', url: string, body?: object) =>
      (await request(app)[m](url).set('Authorization', await bearer(role)).send(body)).status;
    expect(await call('teacher', 'get', '/api/admissions')).toBe(403);
    expect(await call('reception', 'get', '/api/admissions')).toBe(200);
    expect(await call('reception', 'post', '/api/admissions', good)).toBe(201);
    expect(await call('reception', 'patch', `/api/admissions/${APP}`, { firstName: 'X' })).toBe(403);
    expect(await call('officer', 'patch', `/api/admissions/${APP}`, { firstName: 'X' })).toBe(200);
    expect(await call('officer', 'post', `/api/admissions/${APP}/approve`, { admissionDate: '2026-04-01' })).toBe(403);
    expect(await call('officer', 'post', `/api/admissions/${APP}/reject`, {})).toBe(403);
    expect(await call('principal', 'post', `/api/admissions/${APP}/approve`, { admissionDate: '2026-04-01' })).toBe(200);
    expect(await call('principal', 'post', `/api/admissions/${APP}/reject`, { note: 'No seats' })).toBe(200);
  });
  it('needs a school token and always uses it', async () => {
    const { app, calls } = build();
    expect((await request(app).get('/api/admissions')).status).toBe(401);
    expect((await request(app).get('/api/admissions').set('Authorization', await bearer('admin', null))).status).toBe(403);
    await request(app).post('/api/admissions').set('Authorization', await bearer('admin')).send({ ...good, schoolId: SCHOOL_B });
    expect(calls[0].args[0]).toBe(SCHOOL_A);
    expect(JSON.stringify(calls[0].args[1])).not.toContain(SCHOOL_B);
  });
  it('validates applications and the approval body', async () => {
    const { app, calls } = build();
    const auth = await bearer('admin');
    const post = (url: string, body: object) => request(app).post(url).set('Authorization', auth).send(body);
    expect((await post('/api/admissions', { ...good, guardianPhone: 'abc' })).status).toBe(400);
    expect((await post('/api/admissions', { ...good, dateOfBirth: '2999-01-01' })).status).toBe(400);
    expect((await post('/api/admissions', { ...good, appliedClassId: 'x' })).status).toBe(400);
    expect((await post('/api/admissions', { ...good, guardianEmail: 'nope' })).status).toBe(400);
    expect((await post(`/api/admissions/${APP}/approve`, {})).status).toBe(400);
    expect((await post(`/api/admissions/${APP}/approve`, { admissionDate: 'tomorrow' })).status).toBe(400);
    expect((await request(app).patch(`/api/admissions/${APP}`).set('Authorization', auth).send({})).status).toBe(400);
    expect(calls).toHaveLength(0);
    expect((await post('/api/admissions', { ...good, guardianEmail: '', address: '' })).status).toBe(201);
    expect(calls[0].args[1]).toMatchObject({ guardianEmail: null, address: null });
    expect((calls[0].args[1] as { applicationDate: string }).applicationDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('parent portal and guardian accounts', () => {
  it('portal children needs portal.own.read and uses the caller id from the token', async () => {
    const { app, calls } = build();
    expect((await request(app).get('/api/portal/children').set('Authorization', await bearer('teacher'))).status).toBe(403);
    expect((await request(app).get('/api/portal/children').set('Authorization', await bearer('parent', SCHOOL_A, 'parent-1')).query({ userId: 'someone-else' })).status).toBe(200);
    expect(calls[0].args).toEqual([SCHOOL_A, 'parent-1']);
  });
  it('only a school administrator creates a guardian account, with a validated body', async () => {
    const { app, calls } = build();
    const G = '55555555-5555-4555-8555-555555555555';
    const post = async (role: string, body: object) => (await request(app).post(`/api/school/guardians/${G}/account`).set('Authorization', await bearer(role)).send(body)).status;
    expect(await post('officer', { email: 'p@x.test', password: 'long-enough-pw' })).toBe(403);
    expect(await post('admin', { email: 'bad', password: 'long-enough-pw' })).toBe(400);
    expect(await post('admin', { email: 'p@x.test', password: 'short' })).toBe(400);
    expect(calls).toHaveLength(0);
    expect(await post('admin', { email: 'P@X.test', password: 'long-enough-pw' })).toBe(201);
    expect(calls[0].args[2]).toMatchObject({ email: 'p@x.test' });
  });
});
