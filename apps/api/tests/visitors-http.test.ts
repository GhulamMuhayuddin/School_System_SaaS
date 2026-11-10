import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import type { VisitorsApi } from '../src/modules/visitors/visitors.types';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const ID = '44444444-4444-4444-8444-444444444444';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = { viewer: ['visitor.read'], desk: ['visitor.read', 'visitor.manage'], manageOnly: ['visitor.manage'], none: ['student.read'] };
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A, userId = 'actor') => `Bearer ${(await tokens.sign({ userId, schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const visitors = { summary: rec('summary'), list: rec('list', { visits: [], truncated: false }), checkIn: rec('checkIn'), checkOut: rec('checkOut'), update: rec('update') } as unknown as VisitorsApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    visitors,
  });
  return { app, calls };
}
type M = 'get' | 'post' | 'patch';
const call = async (app: ReturnType<typeof build>['app'], role: string, m: M, url: string, body?: object) =>
  (await request(app)[m](url).set('Authorization', await bearer(role)).send(body)).status;
const visit = { name: 'Mr Tariq', phone: '0300-1234567', purpose: 'Admission enquiry', visiting: 'Principal' };

describe('visitor routes', () => {
  it('needs a login, a school and visitor.read', async () => {
    const { app } = build();
    expect((await request(app).get('/api/visitors/visits')).status).toBe(401);
    expect(await call(app, 'none', 'get', '/api/visitors/visits')).toBe(403);
    expect(await call(app, 'manageOnly', 'get', '/api/visitors/visits')).toBe(403);
    expect((await request(app).get('/api/visitors/visits').set('Authorization', await bearer('viewer', null))).status).toBe(403);
    for (const url of ['/api/visitors/summary', '/api/visitors/visits', '/api/visitors/visits?date=2026-11-04&q=tariq', '/api/visitors/visits?inside=true']) expect(await call(app, 'viewer', 'get', url)).toBe(200);
  });
  it('checking in, out and editing need visitor.read AND visitor.manage', async () => {
    const { app } = build();
    for (const role of ['viewer', 'manageOnly']) {
      expect(await call(app, role, 'post', '/api/visitors/visits', visit)).toBe(403);
      expect(await call(app, role, 'post', `/api/visitors/visits/${ID}/checkout`)).toBe(403);
      expect(await call(app, role, 'patch', `/api/visitors/visits/${ID}`, { notes: 'x' })).toBe(403);
    }
    expect(await call(app, 'desk', 'post', '/api/visitors/visits', visit)).toBe(201);
    expect(await call(app, 'desk', 'post', `/api/visitors/visits/${ID}/checkout`)).toBe(200);
    expect(await call(app, 'desk', 'patch', `/api/visitors/visits/${ID}`, { notes: 'Came with his son' })).toBe(200);
  });
  it('validates input', async () => {
    const { app } = build();
    const v = (b: object) => call(app, 'desk', 'post', '/api/visitors/visits', { ...visit, ...b });
    expect(await v({ name: 'x' })).toBe(400);
    expect(await v({ purpose: '' })).toBe(400);
    expect(await v({ phone: 'call me' })).toBe(400);
    expect(await v({ studentId: 'nope' })).toBe(400);
    expect(await v({ notes: 'x'.repeat(301) })).toBe(400);
    expect(await call(app, 'desk', 'patch', `/api/visitors/visits/${ID}`, {})).toBe(400);
    expect(await call(app, 'desk', 'post', '/api/visitors/visits/nope/checkout')).toBe(400);
    expect(await call(app, 'viewer', 'get', '/api/visitors/visits?date=2026-02-30')).toBe(400);
  });
  it('the school and the user come from the token only', async () => {
    const { app, calls } = build();
    await request(app).post('/api/visitors/visits').set('Authorization', await bearer('desk', SCHOOL_A, 'u-1')).send({ ...visit, schoolId: 'evil' });
    const c = calls.find((x) => x.name === 'checkIn')!;
    expect(c.args.slice(0, 2)).toEqual([SCHOOL_A, 'u-1']);
    expect(c.args[2]).toEqual({ name: 'Mr Tariq', phone: '0300-1234567', purpose: 'Admission enquiry', visiting: 'Principal' });
    await request(app).get('/api/visitors/visits?inside=true').set('Authorization', await bearer('viewer'));
    expect(calls.find((x) => x.name === 'list')!.args[1]).toEqual({ date: undefined, insideOnly: true, q: undefined });
  });
});
