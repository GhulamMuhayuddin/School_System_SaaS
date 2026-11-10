import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthApi } from '../src/modules/auth/auth.types';
import type { PlatformApi } from '../src/modules/platform/platform.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import { AppError } from '../src/utils/errors';

const SCHOOL = '11111111-1111-4111-8111-111111111111';
const PLAN = '33333333-3333-4333-8333-333333333333';
const ACTOR = '44444444-4444-4444-8444-444444444444';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = {
  'role-super': ['platform.school.manage', 'platform.plan.manage', 'platform.analytics.view', 'platform.logs.view', 'platform.admin.manage'],
  'role-limited': ['platform.analytics.view'],
  'role-school': ['school.role.manage', 'platform.school.manage'], // even with the permission, a school user must be refused
};
const bearer = async (roleId: string, schoolId: string | null = null) =>
  `Bearer ${(await tokens.sign({ userId: ACTOR, schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const platform = {
    listSchools: rec('listSchools', []), getSchool: rec('getSchool', { id: SCHOOL }),
    createSchool: rec('createSchool', { id: SCHOOL }), updateSchool: rec('updateSchool', { id: SCHOOL }),
    setSchoolStatus: rec('setSchoolStatus', { id: SCHOOL }), setSubscription: rec('setSubscription', { id: SCHOOL }),
    listPlans: rec('listPlans', []), createPlan: rec('createPlan', { id: PLAN }), updatePlan: rec('updatePlan', { id: PLAN }),
    analytics: rec('analytics', { logins7d: 0 }), listAuditLogs: rec('listAuditLogs', []),
    listPlatformAdmins: rec('listPlatformAdmins', []), createPlatformAdmin: rec('createPlatformAdmin', { id: ACTOR }),
    setPlatformAdminStatus: async (...a: unknown[]) => { calls.push({ name: 'setPlatformAdminStatus', args: a }); throw new AppError(400, 'BAD_REQUEST', 'At least one active platform administrator is required'); },
  } as unknown as PlatformApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: {
      service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t),
      permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false },
    },
    platform,
  });
  return { app, calls };
}

const validSchool = {
  name: 'City School', code: 'city-school', planId: PLAN,
  admin: { firstName: 'A', lastName: 'B', email: 'Admin@City.com', password: 'long-enough-pw' },
};

describe('/api/platform access control', () => {
  it('requires a token', async () => {
    const { app } = build();
    expect((await request(app).get('/api/platform/schools')).status).toBe(401);
  });
  it('refuses school users even when their role has a platform permission', async () => {
    const { app, calls } = build();
    const res = await request(app).get('/api/platform/schools').set('Authorization', await bearer('role-school', SCHOOL));
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });
  it('refuses a platform user without the needed permission', async () => {
    const { app } = build();
    const auth = await bearer('role-limited');
    expect((await request(app).get('/api/platform/schools').set('Authorization', auth)).status).toBe(403);
    expect((await request(app).get('/api/platform/analytics').set('Authorization', auth)).status).toBe(200);
    expect((await request(app).get('/api/platform/plans').set('Authorization', auth)).status).toBe(403);
    expect((await request(app).get('/api/platform/admins').set('Authorization', auth)).status).toBe(403);
  });
});

describe('/api/platform validation and wiring', () => {
  it('creates a school with a normalised body and the signed-in actor', async () => {
    const { app, calls } = build();
    const res = await request(app).post('/api/platform/schools').set('Authorization', await bearer('role-super')).send(validSchool);
    expect(res.status).toBe(201);
    const [input, actor] = calls[0].args as [typeof validSchool & { timezone: string }, string];
    expect(input.admin.email).toBe('admin@city.com');
    expect(input.timezone).toBe('Asia/Karachi');
    expect(actor).toBe(ACTOR);
  });
  it('rejects bad school input', async () => {
    const { app, calls } = build();
    const auth = await bearer('role-super');
    const post = (body: object) => request(app).post('/api/platform/schools').set('Authorization', auth).send(body);
    expect((await post({ ...validSchool, code: 'Bad Code!' })).status).toBe(400);
    expect((await post({ ...validSchool, planId: 'nope' })).status).toBe(400);
    expect((await post({ ...validSchool, admin: { ...validSchool.admin, password: 'short' } })).status).toBe(400);
    expect((await post({ name: 'x' })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it('validates ids, status values, plans and empty updates', async () => {
    const { app } = build();
    const auth = await bearer('role-super');
    const r = (m: 'get' | 'post' | 'patch' | 'put', url: string, body?: object) => request(app)[m](url).set('Authorization', auth).send(body);
    expect((await r('get', '/api/platform/schools/not-a-uuid')).status).toBe(400);
    expect((await r('post', `/api/platform/schools/${SCHOOL}/status`, { status: 'DELETED' })).status).toBe(400);
    expect((await r('post', `/api/platform/schools/${SCHOOL}/status`, { status: 'SUSPENDED' })).status).toBe(200);
    expect((await r('patch', `/api/platform/schools/${SCHOOL}`, {})).status).toBe(400);
    expect((await r('put', `/api/platform/schools/${SCHOOL}/subscription`, { planId: PLAN, status: 'WHATEVER' })).status).toBe(400);
    expect((await r('put', `/api/platform/schools/${SCHOOL}/subscription`, { planId: PLAN, status: 'ACTIVE', endsAt: '2027-01-31' })).status).toBe(200);
    expect((await r('post', '/api/platform/plans', { name: 'Pro', priceMonthly: -1 })).status).toBe(400);
    expect((await r('post', '/api/platform/plans', { name: 'Pro', priceMonthly: 5000 })).status).toBe(201);
    expect((await r('get', '/api/platform/audit-logs?limit=9999')).status).toBe(400);
    expect((await r('get', '/api/platform/audit-logs?limit=50')).status).toBe(200);
  });
  it('passes service errors through with their status and code', async () => {
    const { app } = build();
    const res = await request(app).post(`/api/platform/admins/${ACTOR}/status`).set('Authorization', await bearer('role-super')).send({ status: 'INACTIVE' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('At least one active');
  });
});
