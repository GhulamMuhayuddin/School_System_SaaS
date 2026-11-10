import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import type { ComplaintsApi } from '../src/modules/complaints/complaints.types';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const ID = '44444444-4444-4444-8444-444444444444';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = { viewer: ['complaint.read'], handler: ['complaint.read', 'complaint.manage'], manageOnly: ['complaint.manage'], none: ['student.read'] };
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A, userId = 'actor') => `Bearer ${(await tokens.sign({ userId, schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const complaints = {
    summary: rec('summary'), list: rec('list', { complaints: [], truncated: false }), get: rec('get'), create: rec('create'), update: rec('update'),
    assign: rec('assign'), setStatus: rec('setStatus'), addNote: rec('addNote'),
  } as unknown as ComplaintsApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    complaints,
  });
  return { app, calls };
}
type M = 'get' | 'post' | 'patch';
const call = async (app: ReturnType<typeof build>['app'], role: string, m: M, url: string, body?: object) =>
  (await request(app)[m](url).set('Authorization', await bearer(role)).send(body)).status;
const complaint = { source: 'PARENT', name: 'Mrs Aslam', phone: '0300-1234567', category: 'FEES', subject: 'Fee charged twice', details: 'October fee was taken two times.', priority: 'HIGH' };

describe('complaint routes', () => {
  it('needs a login, a school and complaint.read', async () => {
    const { app } = build();
    expect((await request(app).get('/api/complaints')).status).toBe(401);
    expect(await call(app, 'none', 'get', '/api/complaints')).toBe(403);
    expect(await call(app, 'manageOnly', 'get', '/api/complaints')).toBe(403);
    expect((await request(app).get('/api/complaints').set('Authorization', await bearer('viewer', null))).status).toBe(403);
    for (const url of ['/api/complaints/summary', '/api/complaints', '/api/complaints?status=OPEN&category=FEES&priority=HIGH&active=true&q=fee', `/api/complaints/${ID}`]) expect(await call(app, 'viewer', 'get', url)).toBe(200);
  });
  it('every change needs complaint.read AND complaint.manage', async () => {
    const { app } = build();
    const actions: [M, string, object | undefined][] = [
      ['post', '/api/complaints', complaint], ['patch', `/api/complaints/${ID}`, { priority: 'LOW' }], ['post', `/api/complaints/${ID}/assign`, { staffId: ID }],
      ['post', `/api/complaints/${ID}/status`, { status: 'IN_PROGRESS' }], ['post', `/api/complaints/${ID}/notes`, { text: 'Called the parent' }],
    ];
    for (const [m, url, body] of actions) {
      expect(await call(app, 'viewer', m, url, body)).toBe(403);
      expect(await call(app, 'manageOnly', m, url, body)).toBe(403);
      expect([200, 201]).toContain(await call(app, 'handler', m, url, body));
    }
  });
  it('validates input', async () => {
    const { app } = build();
    const c = (b: object) => call(app, 'handler', 'post', '/api/complaints', { ...complaint, ...b });
    expect(await c({ source: 'ALIEN' })).toBe(400);
    expect(await c({ category: 'WEATHER' })).toBe(400);
    expect(await c({ priority: 'URGENT' })).toBe(400);
    expect(await c({ name: 'x' })).toBe(400);
    expect(await c({ subject: 'ab' })).toBe(400);
    expect(await c({ details: '' })).toBe(400);
    expect(await c({ details: 'x'.repeat(2001) })).toBe(400);
    expect(await c({ phone: 'call me' })).toBe(400);
    expect(await c({ studentId: 'nope' })).toBe(400);
    expect(await call(app, 'handler', 'patch', `/api/complaints/${ID}`, {})).toBe(400);
    expect(await call(app, 'handler', 'post', `/api/complaints/${ID}/status`, { status: 'DONE' })).toBe(400);
    expect(await call(app, 'handler', 'post', `/api/complaints/${ID}/assign`, {})).toBe(400);
    expect(await call(app, 'handler', 'post', `/api/complaints/${ID}/assign`, { staffId: null })).toBe(200);
    expect(await call(app, 'handler', 'post', `/api/complaints/${ID}/notes`, { text: '' })).toBe(400);
    expect(await call(app, 'viewer', 'get', '/api/complaints?status=DONE')).toBe(400);
    expect(await call(app, 'viewer', 'get', '/api/complaints/nope')).toBe(400);
  });
  it('the school and the user come from the token only', async () => {
    const { app, calls } = build();
    await request(app).post(`/api/complaints/${ID}/status`).set('Authorization', await bearer('handler', SCHOOL_A, 'u-1')).send({ status: 'RESOLVED', resolution: 'Refunded', schoolId: 'evil' });
    expect(calls.find((c) => c.name === 'setStatus')!.args).toEqual([SCHOOL_A, 'u-1', ID, 'RESOLVED', 'Refunded']);
  });
});
