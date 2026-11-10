import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import type { FeesApi } from '../src/modules/fees/fees.types';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const ID = '44444444-4444-4444-8444-444444444444';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = {
  viewer: ['fee.read'],
  collector: ['fee.read', 'fee.collect'],
  manager: ['fee.read', 'fee.manage'],
  reporter: ['fee.read', 'fee.report'],
  none: ['student.read'],
};
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A, userId = 'actor') => `Bearer ${(await tokens.sign({ userId, schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const fees = {
    heads: rec('heads', []), createHead: rec('createHead'), updateHead: rec('updateHead'), structure: rec('structure'), setStructure: rec('setStructure'),
    concession: rec('concession', null), setConcession: rec('setConcession'), removeConcession: rec('removeConcession', undefined),
    generate: rec('generate'), listVouchers: rec('listVouchers', []), getVoucher: rec('getVoucher'), cancelVoucher: rec('cancelVoucher'),
    pay: rec('pay'), getPayment: rec('getPayment'), voidPayment: rec('voidPayment'), summary: rec('summary'), defaulters: rec('defaulters', []),
  } as unknown as FeesApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    fees,
  });
  return { app, calls };
}
type Method = 'get' | 'put' | 'post' | 'patch' | 'delete';
const call = async (app: ReturnType<typeof build>['app'], role: string, m: Method, url: string, body?: object) =>
  (await request(app)[m](url).set('Authorization', await bearer(role)).send(body)).status;

const generate = { classId: ID, period: '2026-11', dueDate: '2026-11-10' };
const pay = { amount: 1500, method: 'CASH' };

describe('fee routes', () => {
  it('needs sign-in and a school', async () => {
    const { app } = build();
    expect((await request(app).get('/api/fees/heads')).status).toBe(401);
    expect((await request(app).get('/api/fees/heads').set('Authorization', await bearer('viewer', null))).status).toBe(403);
    expect(await call(app, 'none', 'get', '/api/fees/heads')).toBe(403);
  });

  it('read, manage, collect and report are separate permissions', async () => {
    const { app } = build();
    // read
    for (const url of ['/api/fees/heads', `/api/fees/structure/${ID}`, `/api/fees/concessions/${ID}`, '/api/fees/vouchers', `/api/fees/vouchers/${ID}`, `/api/fees/payments/${ID}`]) {
      expect(await call(app, 'viewer', 'get', url), url).toBe(200);
    }
    // manage
    const manageOnly: [Method, string, object?][] = [
      ['post', '/api/fees/heads', { name: 'Tuition' }],
      ['patch', `/api/fees/heads/${ID}`, { isActive: false }],
      ['put', `/api/fees/structure/${ID}`, { items: [] }],
      ['put', `/api/fees/concessions/${ID}`, { kind: 'PERCENT', value: 10 }],
      ['delete', `/api/fees/concessions/${ID}`],
      ['post', '/api/fees/vouchers/generate', generate],
      ['post', `/api/fees/vouchers/${ID}/cancel`, { reason: 'Wrong class' }],
      ['post', `/api/fees/payments/${ID}/void`, { reason: 'Wrong amount' }],
    ];
    for (const [m, url, body] of manageOnly) {
      expect(await call(app, 'viewer', m, url, body), `viewer ${m} ${url}`).toBe(403);
      expect(await call(app, 'collector', m, url, body), `collector ${m} ${url}`).toBe(403);
      expect([200, 201, 204], `manager ${m} ${url}`).toContain(await call(app, 'manager', m, url, body));
    }
    // collect
    expect(await call(app, 'viewer', 'post', `/api/fees/vouchers/${ID}/payments`, pay)).toBe(403);
    expect(await call(app, 'manager', 'post', `/api/fees/vouchers/${ID}/payments`, pay)).toBe(403); // managing is not collecting
    expect(await call(app, 'collector', 'post', `/api/fees/vouchers/${ID}/payments`, pay)).toBe(201);
    // report
    expect(await call(app, 'viewer', 'get', '/api/fees/reports/summary')).toBe(403);
    expect(await call(app, 'viewer', 'get', '/api/fees/reports/defaulters')).toBe(403);
    expect(await call(app, 'reporter', 'get', '/api/fees/reports/summary')).toBe(200);
    expect(await call(app, 'reporter', 'get', '/api/fees/reports/defaulters')).toBe(200);
  });

  it('passes the school and the caller from the token, never from the request', async () => {
    const { app, calls } = build();
    const auth = await bearer('collector', SCHOOL_A, 'u-cashier');
    await request(app).post(`/api/fees/vouchers/${ID}/payments`).set('Authorization', auth).send({ ...pay, schoolId: 'other', receivedById: 'someone' });
    const p = calls.find((c) => c.name === 'pay')!;
    expect(p.args.slice(0, 3)).toEqual([SCHOOL_A, 'u-cashier', ID]);
    expect(p.args[3]).toMatchObject({ amount: 1500, method: 'CASH' });
    expect(JSON.stringify(p.args)).not.toContain('someone');
  });

  it('turns the overdue query text into a boolean for the service', async () => {
    const { app, calls } = build();
    await request(app).get('/api/fees/vouchers?overdue=true&status=UNPAID').set('Authorization', await bearer('viewer'));
    await request(app).get('/api/fees/vouchers').set('Authorization', await bearer('viewer'));
    const lists = calls.filter((c) => c.name === 'listVouchers');
    expect(lists[0].args[1]).toMatchObject({ overdue: true, status: 'UNPAID' });
    expect(lists[1].args[1]).toMatchObject({ overdue: false });
  });

  it('answers 200 with a null concession and 204 on removal', async () => {
    const { app } = build();
    const res = await request(app).get(`/api/fees/concessions/${ID}`).set('Authorization', await bearer('viewer'));
    expect(res.body).toEqual({ concession: null });
    expect(await call(app, 'manager', 'delete', `/api/fees/concessions/${ID}`)).toBe(204);
  });

  it('rejects bad input before it reaches the service', async () => {
    const { app, calls } = build();
    const c = (role: string, m: Method, url: string, body?: object) => call(app, role, m, url, body);
    // fee heads and structure
    expect(await c('manager', 'post', '/api/fees/heads', { name: 'x' })).toBe(400);
    expect(await c('manager', 'patch', `/api/fees/heads/${ID}`, {})).toBe(400);
    expect(await c('manager', 'put', `/api/fees/structure/${ID}`, { items: [{ feeHeadId: ID, amount: 0, frequency: 'MONTHLY' }] })).toBe(400);
    expect(await c('manager', 'put', `/api/fees/structure/${ID}`, { items: [{ feeHeadId: ID, amount: 500, frequency: 'WEEKLY' }] })).toBe(400);
    expect(await c('manager', 'put', `/api/fees/structure/${ID}`, { items: [{ feeHeadId: 'nope', amount: 500, frequency: 'MONTHLY' }] })).toBe(400);
    // concessions
    expect(await c('manager', 'put', `/api/fees/concessions/${ID}`, { kind: 'PERCENT', value: 101 })).toBe(400);
    expect(await c('manager', 'put', `/api/fees/concessions/${ID}`, { kind: 'PERCENT', value: 0 })).toBe(400);
    expect(await c('manager', 'put', `/api/fees/concessions/${ID}`, { kind: 'FIXED', value: 12.5 })).toBe(400);
    expect(await c('manager', 'put', `/api/fees/concessions/${ID}`, { kind: 'FIXED', value: -5 })).toBe(400);
    expect(await c('manager', 'put', `/api/fees/concessions/${ID}`, { kind: 'HALF', value: 5 })).toBe(400);
    // generating vouchers
    expect(await c('manager', 'post', '/api/fees/vouchers/generate', { ...generate, period: '2026-13' })).toBe(400);
    expect(await c('manager', 'post', '/api/fees/vouchers/generate', { ...generate, period: '2026-1' })).toBe(400);
    expect(await c('manager', 'post', '/api/fees/vouchers/generate', { ...generate, dueDate: '2026-02-30' })).toBe(400);
    expect(await c('manager', 'post', '/api/fees/vouchers/generate', { period: '2026-11', dueDate: '2026-11-10' })).toBe(400); // classId missing
    // listing, paying, cancelling, voiding
    expect(await c('viewer', 'get', '/api/fees/vouchers?status=DONE')).toBe(400);
    expect(await c('viewer', 'get', '/api/fees/vouchers?period=2026-00')).toBe(400);
    expect(await c('viewer', 'get', '/api/fees/vouchers/not-a-uuid')).toBe(400);
    for (const body of [{ amount: 0, method: 'CASH' }, { amount: -10, method: 'CASH' }, { amount: 15.5, method: 'CASH' }, { amount: 100_000_001, method: 'CASH' }, { amount: 100, method: 'CHEQUE' }, { amount: 100 }]) {
      expect(await c('collector', 'post', `/api/fees/vouchers/${ID}/payments`, body), JSON.stringify(body)).toBe(400);
    }
    expect(await c('manager', 'post', `/api/fees/vouchers/${ID}/cancel`, { reason: 'x' })).toBe(400);
    expect(await c('manager', 'post', `/api/fees/payments/${ID}/void`, {})).toBe(400);
    // reports
    expect(await c('reporter', 'get', '/api/fees/reports/summary?from=2026-11-10&to=2026-11-01')).toBe(400);
    expect(await c('reporter', 'get', '/api/fees/reports/summary?from=2026-02-30')).toBe(400);
    expect(await c('reporter', 'get', '/api/fees/reports/defaulters?classId=nope')).toBe(400);
    const writes = ['createHead', 'updateHead', 'setStructure', 'setConcession', 'generate', 'pay', 'cancelVoucher', 'voidPayment', 'listVouchers', 'getVoucher', 'summary', 'defaulters'];
    expect(calls.filter((x) => writes.includes(x.name))).toHaveLength(0);
  });
});
