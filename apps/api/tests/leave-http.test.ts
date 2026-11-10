import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import type { LeaveApi } from '../src/modules/leave/leave.types';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const ID = '44444444-4444-4444-8444-444444444444';
const ID2 = '55555555-5555-4555-8555-555555555555';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = {
  teacher: ['leave.apply'], reader: ['leave.read'], approver: ['leave.approve'], hr: ['leave.apply', 'leave.read', 'leave.approve', 'staff.update'], none: ['student.read'],
};
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A, userId = 'actor') => `Bearer ${(await tokens.sign({ userId, schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const leave = {
    listTypes: rec('listTypes', []), createType: rec('createType'), updateType: rec('updateType'), addDefaultTypes: rec('addDefaultTypes', { created: 0, types: [] }),
    list: rec('list', { requests: [], truncated: false }), apply: rec('apply'), approve: rec('approve'), reject: rec('reject'), cancel: rec('cancel'), balances: rec('balances'),
  } as unknown as LeaveApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    leave,
  });
  return { app, calls };
}
type M = 'get' | 'post' | 'put' | 'patch' | 'delete';
const call = async (app: ReturnType<typeof build>['app'], role: string, m: M, url: string, body?: object) =>
  (await request(app)[m](url).set('Authorization', await bearer(role)).send(body)).status;
const apply = { leaveTypeId: ID, fromDate: '2026-11-09', toDate: '2026-11-11', reason: 'Family wedding' };

describe('leave routes: who may do what', () => {
  it('needs a login, a school and some leave permission', async () => {
    const { app } = build();
    expect((await request(app).get('/api/leave/requests')).status).toBe(401);
    expect(await call(app, 'none', 'get', '/api/leave/requests')).toBe(403);
    expect(await call(app, 'none', 'post', '/api/leave/requests', apply)).toBe(403);
    expect((await request(app).get('/api/leave/requests').set('Authorization', await bearer('teacher', null))).status).toBe(403);
    for (const role of ['teacher', 'reader', 'approver', 'hr']) {
      for (const url of ['/api/leave/types', '/api/leave/requests', '/api/leave/balances', '/api/leave/balances?year=2026']) expect(await call(app, role, 'get', url)).toBe(200);
    }
  });

  it('applying needs leave.apply or leave.approve; reading alone cannot apply', async () => {
    const { app } = build();
    expect(await call(app, 'teacher', 'post', '/api/leave/requests', apply)).toBe(201);
    expect(await call(app, 'approver', 'post', '/api/leave/requests', apply)).toBe(201);
    expect(await call(app, 'reader', 'post', '/api/leave/requests', apply)).toBe(403);
  });

  it('only leave.approve decides; the owner may cancel', async () => {
    const { app } = build();
    for (const action of ['approve', 'reject']) {
      expect(await call(app, 'teacher', 'post', `/api/leave/requests/${ID}/${action}`, {})).toBe(403);
      expect(await call(app, 'reader', 'post', `/api/leave/requests/${ID}/${action}`, {})).toBe(403);
      expect(await call(app, 'approver', 'post', `/api/leave/requests/${ID}/${action}`, { note: 'ok' })).toBe(200);
    }
    expect(await call(app, 'teacher', 'post', `/api/leave/requests/${ID}/cancel`)).toBe(200);
    expect(await call(app, 'reader', 'post', `/api/leave/requests/${ID}/cancel`)).toBe(403);
  });

  it('changing leave types needs leave.read AND staff.update', async () => {
    const { app } = build();
    const body = { name: 'Study leave', yearlyQuota: 5, paid: true };
    expect(await call(app, 'teacher', 'post', '/api/leave/types', body)).toBe(403);
    expect(await call(app, 'approver', 'post', '/api/leave/types', body)).toBe(403);
    expect(await call(app, 'hr', 'post', '/api/leave/types', body)).toBe(201);
    expect(await call(app, 'hr', 'patch', `/api/leave/types/${ID}`, { active: false })).toBe(200);
    expect(await call(app, 'teacher', 'patch', `/api/leave/types/${ID}`, { active: false })).toBe(403);
    expect(await call(app, 'hr', 'post', '/api/leave/types/defaults')).toBe(200);
    expect(await call(app, 'teacher', 'post', '/api/leave/types/defaults')).toBe(403);
  });

  it('validates input', async () => {
    const { app } = build();
    const a = (b: object) => call(app, 'teacher', 'post', '/api/leave/requests', { ...apply, ...b });
    expect(await a({ leaveTypeId: 'nope' })).toBe(400);
    expect(await a({ fromDate: '2026-02-30' })).toBe(400);
    expect(await a({ toDate: '11/11/2026' })).toBe(400);
    expect(await a({ staffId: 'nope' })).toBe(400);
    expect(await a({ reason: 'x'.repeat(301) })).toBe(400);
    expect(await call(app, 'hr', 'post', '/api/leave/types', { name: 'x' })).toBe(400);
    expect(await call(app, 'hr', 'post', '/api/leave/types', { name: 'Study leave', yearlyQuota: 0 })).toBe(400);
    expect(await call(app, 'hr', 'patch', `/api/leave/types/${ID}`, {})).toBe(400);
    expect(await call(app, 'reader', 'get', '/api/leave/requests?status=MAYBE')).toBe(400);
    expect(await call(app, 'reader', 'get', '/api/leave/requests?from=2026-13-01')).toBe(400);
    expect(await call(app, 'reader', 'get', '/api/leave/balances?year=1999')).toBe(400);
    expect(await call(app, 'approver', 'post', `/api/leave/requests/nope/approve`, {})).toBe(400);
  });

  it('tells the service who is calling, from the role only', async () => {
    const { app, calls } = build();
    await request(app).get(`/api/leave/requests?staffId=${ID2}&mine=true`).set('Authorization', await bearer('teacher', SCHOOL_A, 'u-teacher'));
    await request(app).post('/api/leave/requests').set('Authorization', await bearer('hr', SCHOOL_A, 'u-hr')).send({ ...apply, schoolId: 'evil' });
    const list = calls.find((c) => c.name === 'list')!;
    expect(list.args[0]).toBe(SCHOOL_A);
    expect(list.args[1]).toEqual({ userId: 'u-teacher', canApprove: false, canSeeAll: false });
    expect(list.args[2]).toMatchObject({ staffId: ID2, mine: true });
    const applied = calls.find((c) => c.name === 'apply')!;
    expect(applied.args[0]).toBe(SCHOOL_A);
    expect(applied.args[1]).toEqual({ userId: 'u-hr', canApprove: true, canSeeAll: true });
  });
});
