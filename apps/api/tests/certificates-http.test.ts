import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import type { CertificatesApi } from '../src/modules/certificates/certificates.types';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const ID = '44444444-4444-4444-8444-444444444444';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = { viewer: ['certificate.read'], clerk: ['certificate.read', 'certificate.issue'], issueOnly: ['certificate.issue'], none: ['student.read'] };
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A, userId = 'actor') => `Bearer ${(await tokens.sign({ userId, schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const certs = { list: rec('list', { certificates: [], truncated: false }), get: rec('get'), issue: rec('issue'), void: rec('void') } as unknown as CertificatesApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    certificates: certs,
  });
  return { app, calls };
}
type M = 'get' | 'post';
const call = async (app: ReturnType<typeof build>['app'], role: string, m: M, url: string, body?: object) =>
  (await request(app)[m](url).set('Authorization', await bearer(role)).send(body)).status;
const issue = { studentId: ID, type: 'BONAFIDE', purpose: 'Passport application' };

describe('certificate routes', () => {
  it('viewing needs a login, a school and certificate.read', async () => {
    const { app } = build();
    expect((await request(app).get('/api/certificates')).status).toBe(401);
    expect(await call(app, 'none', 'get', '/api/certificates')).toBe(403);
    expect(await call(app, 'issueOnly', 'get', '/api/certificates')).toBe(403);
    expect((await request(app).get('/api/certificates').set('Authorization', await bearer('viewer', null))).status).toBe(403);
    for (const url of ['/api/certificates', '/api/certificates?type=LEAVING&status=VALID&q=ali', `/api/certificates/${ID}`]) expect(await call(app, 'viewer', 'get', url)).toBe(200);
  });
  it('issuing and voiding need certificate.read AND certificate.issue', async () => {
    const { app } = build();
    for (const role of ['viewer', 'issueOnly']) {
      expect(await call(app, role, 'post', '/api/certificates', issue)).toBe(403);
      expect(await call(app, role, 'post', `/api/certificates/${ID}/void`, { reason: 'Wrong name' })).toBe(403);
    }
    expect(await call(app, 'clerk', 'post', '/api/certificates', issue)).toBe(201);
    expect(await call(app, 'clerk', 'post', `/api/certificates/${ID}/void`, { reason: 'Wrong name' })).toBe(200);
  });
  it('validates input', async () => {
    const { app } = build();
    const i = (b: object) => call(app, 'clerk', 'post', '/api/certificates', { ...issue, ...b });
    expect(await i({ studentId: 'nope' })).toBe(400);
    expect(await i({ type: 'DIPLOMA' })).toBe(400);
    expect(await i({ issuedOn: '2026-02-30' })).toBe(400);
    expect(await i({ purpose: 'x'.repeat(121) })).toBe(400);
    expect(await i({ remarks: 'x'.repeat(301) })).toBe(400);
    expect(await call(app, 'clerk', 'post', `/api/certificates/${ID}/void`, { reason: 'x' })).toBe(400);
    expect(await call(app, 'clerk', 'post', '/api/certificates/nope/void', { reason: 'Wrong name' })).toBe(400);
    expect(await call(app, 'viewer', 'get', '/api/certificates?type=DIPLOMA')).toBe(400);
    expect(await call(app, 'viewer', 'get', '/api/certificates/nope')).toBe(400);
  });
  it('the school and the user come from the token only', async () => {
    const { app, calls } = build();
    await request(app).post('/api/certificates').set('Authorization', await bearer('clerk', SCHOOL_A, 'u-1')).send({ ...issue, schoolId: 'evil', issuedById: 'forged' });
    const c = calls.find((x) => x.name === 'issue')!;
    expect(c.args.slice(0, 2)).toEqual([SCHOOL_A, 'u-1']);
    expect(c.args[2]).toEqual(issue);
  });
});
