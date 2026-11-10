import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AccountsApi } from '../src/modules/accounts/accounts.types';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const ID = '44444444-4444-4444-8444-444444444444';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = {
  viewer: ['accounts.read'],
  manager: ['accounts.read', 'accounts.manage'],
  feeOnly: ['fee.read', 'fee.manage'],
};
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A, userId = 'actor') => `Bearer ${(await tokens.sign({ userId, schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const accounts = {
    categories: rec('categories', []), createCategory: rec('createCategory'), updateCategory: rec('updateCategory'), addDefaultCategories: rec('addDefaultCategories', { created: 0 }),
    listEntries: rec('listEntries', { entries: [], income: 0, expense: 0, truncated: false }), createEntry: rec('createEntry'), getEntry: rec('getEntry'), voidEntry: rec('voidEntry'),
    summary: rec('summary'), monthly: rec('monthly'),
  } as unknown as AccountsApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    accounts,
  });
  return { app, calls };
}
type Method = 'get' | 'post' | 'patch';
const call = async (app: ReturnType<typeof build>['app'], role: string, m: Method, url: string, body?: object) =>
  (await request(app)[m](url).set('Authorization', await bearer(role)).send(body)).status;

const entry = { kind: 'EXPENSE', categoryId: ID, amount: 2500, method: 'CASH', entryDate: '2026-11-03', description: 'Generator diesel' };

describe('accounts routes', () => {
  it('needs sign-in, a school and an accounts permission (fee permissions are not enough)', async () => {
    const { app } = build();
    expect((await request(app).get('/api/accounts/entries')).status).toBe(401);
    expect((await request(app).get('/api/accounts/entries').set('Authorization', await bearer('viewer', null))).status).toBe(403);
    expect(await call(app, 'feeOnly', 'get', '/api/accounts/entries')).toBe(403);
  });

  it('read and manage are separate permissions', async () => {
    const { app } = build();
    for (const url of ['/api/accounts/categories', '/api/accounts/entries', `/api/accounts/entries/${ID}`, '/api/accounts/reports/summary', '/api/accounts/reports/monthly']) {
      expect(await call(app, 'viewer', 'get', url), url).toBe(200);
    }
    const manageOnly: [Method, string, object?][] = [
      ['post', '/api/accounts/categories', { kind: 'INCOME', name: 'Donations' }], ['post', '/api/accounts/categories/defaults'],
      ['patch', `/api/accounts/categories/${ID}`, { isActive: false }], ['post', '/api/accounts/entries', entry], ['post', `/api/accounts/entries/${ID}/void`, { reason: 'Wrong amount' }],
    ];
    for (const [m, url, body] of manageOnly) {
      expect(await call(app, 'viewer', m, url, body), `viewer ${url}`).toBe(403);
      expect([200, 201], `manager ${url}`).toContain(await call(app, 'manager', m, url, body));
    }
  });

  it('takes the school and the user from the token, never from the body', async () => {
    const { app, calls } = build();
    await request(app).post('/api/accounts/entries').set('Authorization', await bearer('manager', SCHOOL_A, 'user-7')).send({ ...entry, schoolId: 'evil' });
    const c = calls.find((x) => x.name === 'createEntry')!;
    expect(c.args[0]).toBe(SCHOOL_A);
    expect(c.args[1]).toBe('user-7');
    expect(JSON.stringify(c.args[2])).not.toContain('evil');
  });

  it('turns includeVoided=true into a boolean and passes filters on', async () => {
    const { app, calls } = build();
    await request(app).get('/api/accounts/entries?includeVoided=true&kind=INCOME&from=2026-11-01&to=2026-11-30').set('Authorization', await bearer('viewer'));
    const f = calls.find((x) => x.name === 'listEntries')!.args[1] as Record<string, unknown>;
    expect(f.includeVoided).toBe(true);
    expect(f.kind).toBe('INCOME');
    expect(f.from).toBe('2026-11-01');
  });

  it('reads the year of the monthly report as a number', async () => {
    const { app, calls } = build();
    await request(app).get('/api/accounts/reports/monthly?year=2026').set('Authorization', await bearer('viewer'));
    expect(calls.find((x) => x.name === 'monthly')!.args[1]).toBe(2026);
  });

  it('refuses bad input with 400 and never reaches the service', async () => {
    const { app, calls } = build();
    const bad: [Method, string, object?][] = [
      ['post', '/api/accounts/entries', { ...entry, amount: 0 }], ['post', '/api/accounts/entries', { ...entry, amount: 12.5 }], ['post', '/api/accounts/entries', { ...entry, amount: -5 }],
      ['post', '/api/accounts/entries', { ...entry, kind: 'FEE' }], ['post', '/api/accounts/entries', { ...entry, method: 'CHEQUE' }], ['post', '/api/accounts/entries', { ...entry, categoryId: 'nope' }],
      ['post', '/api/accounts/entries', { ...entry, entryDate: '2026-13-01' }], ['post', '/api/accounts/entries', { ...entry, entryDate: '03/11/2026' }], ['post', '/api/accounts/entries', { ...entry, description: 'ab' }],
      ['post', '/api/accounts/entries', { ...entry, party: 'x'.repeat(81) }], ['post', '/api/accounts/entries', { ...entry, amount: 100_000_001 }],
      ['post', '/api/accounts/categories', { kind: 'INCOME', name: 'a' }], ['post', '/api/accounts/categories', { kind: 'OTHER', name: 'Donations' }],
      ['patch', `/api/accounts/categories/${ID}`, {}], ['patch', '/api/accounts/categories/not-a-uuid', { isActive: true }],
      ['post', `/api/accounts/entries/${ID}/void`, {}], ['post', `/api/accounts/entries/${ID}/void`, { reason: 'x' }],
      ['get', '/api/accounts/entries?from=2026-11-10&to=2026-11-01'], ['get', '/api/accounts/entries?from=2026-02-30'], ['get', '/api/accounts/entries?kind=FEE'], ['get', '/api/accounts/entries?categoryId=zzz'],
      ['get', '/api/accounts/reports/summary?from=2026-11-10&to=2026-11-01'], ['get', '/api/accounts/reports/monthly?year=1999'], ['get', '/api/accounts/reports/monthly?year=abc'], ['get', '/api/accounts/categories?kind=X'],
    ];
    for (const [m, url, body] of bad) expect(await call(app, 'manager', m, url, body), `${m} ${url} ${JSON.stringify(body)}`).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
