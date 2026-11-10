import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import type { PayrollApi } from '../src/modules/payroll/payroll.types';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const ID = '44444444-4444-4444-8444-444444444444';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = {
  viewer: ['payroll.read'], hr: ['payroll.read', 'payroll.manage'], cashier: ['payroll.read', 'accounts.manage'], manageOnly: ['payroll.manage'], accountsOnly: ['accounts.manage'], none: ['student.read'],
};
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A, userId = 'actor') => `Bearer ${(await tokens.sign({ userId, schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const payroll = {
    listSalaries: rec('listSalaries', { rows: [], truncated: false }), setSalary: rec('setSalary'), listRuns: rec('listRuns', []), getRun: rec('getRun'), createRun: rec('createRun'),
    regenerate: rec('regenerate'), deleteRun: rec('deleteRun'), finalize: rec('finalize'), reopen: rec('reopen'), updateSlip: rec('updateSlip'), pay: rec('pay'),
    voidPayment: rec('voidPayment'), mySlips: rec('mySlips', []), getSlip: rec('getSlip'), mySlip: rec('mySlip'),
  } as unknown as PayrollApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    payroll,
  });
  return { app, calls };
}
type M = 'get' | 'post' | 'put' | 'patch' | 'delete';
const call = async (app: ReturnType<typeof build>['app'], role: string, m: M, url: string, body?: object) =>
  (await request(app)[m](url).set('Authorization', await bearer(role)).send(body)).status;

describe('payroll routes: who may do what', () => {
  it('needs a login, a school and payroll.read', async () => {
    const { app } = build();
    expect((await request(app).get('/api/payroll/runs')).status).toBe(401);
    expect(await call(app, 'none', 'get', '/api/payroll/runs')).toBe(403);
    expect(await call(app, 'manageOnly', 'get', '/api/payroll/runs')).toBe(403);
    for (const url of ['/api/payroll/runs', `/api/payroll/runs/${ID}`, '/api/payroll/salaries', '/api/payroll/salaries?missing=true&q=ali']) expect(await call(app, 'viewer', 'get', url)).toBe(200);
    expect((await request(app).get('/api/payroll/runs').set('Authorization', await bearer('viewer', null))).status).toBe(403);
  });

  it('salaries, runs and payslip adjustments need payroll.read AND payroll.manage', async () => {
    const { app } = build();
    const salary = { basic: 25000, allowances: 5000, fixedDeduction: 1500 };
    const actions: [M, string, object | undefined][] = [
      ['put', `/api/payroll/salaries/${ID}`, salary], ['post', '/api/payroll/runs', { period: '2026-10' }], ['post', `/api/payroll/runs/${ID}/regenerate`, undefined],
      ['post', `/api/payroll/runs/${ID}/finalize`, undefined], ['post', `/api/payroll/runs/${ID}/reopen`, undefined], ['patch', `/api/payroll/payslips/${ID}`, { bonus: 500 }],
    ];
    for (const [m, url, body] of actions) {
      expect(await call(app, 'viewer', m, url, body)).toBe(403);
      expect(await call(app, 'manageOnly', m, url, body)).toBe(403);
      expect([200, 201]).toContain(await call(app, 'hr', m, url, body));
    }
    expect(await call(app, 'viewer', 'delete', `/api/payroll/runs/${ID}`)).toBe(403);
    expect(await call(app, 'hr', 'delete', `/api/payroll/runs/${ID}`)).toBe(204);
  });

  it('paying and voiding a payment need payroll.read AND accounts.manage (HR alone cannot pay)', async () => {
    const { app } = build();
    const pay = { method: 'BANK', paidOn: '2026-11-04' };
    expect(await call(app, 'hr', 'post', `/api/payroll/payslips/${ID}/pay`, pay)).toBe(403);
    expect(await call(app, 'accountsOnly', 'post', `/api/payroll/payslips/${ID}/pay`, pay)).toBe(403);
    expect(await call(app, 'cashier', 'post', `/api/payroll/payslips/${ID}/pay`, pay)).toBe(200);
    expect(await call(app, 'hr', 'post', `/api/payroll/payslips/${ID}/void-payment`, { reason: 'Wrong bank' })).toBe(403);
    expect(await call(app, 'cashier', 'post', `/api/payroll/payslips/${ID}/void-payment`, { reason: 'Wrong bank' })).toBe(200);
  });

  it('GET /my is open to any signed-in school user and is limited by the token', async () => {
    const { app, calls } = build();
    expect((await request(app).get('/api/payroll/my')).status).toBe(401);
    expect((await request(app).get('/api/payroll/my').set('Authorization', await bearer('none', null))).status).toBe(403);
    expect((await request(app).get(`/api/payroll/my?staffId=${ID}`).set('Authorization', await bearer('none', SCHOOL_A, 'u-9'))).status).toBe(200);
    expect(calls.find((c) => c.name === 'mySlips')!.args).toEqual([SCHOOL_A, 'u-9']);
  });

  it('validates input', async () => {
    const { app } = build();
    const run = (b: object) => call(app, 'hr', 'post', '/api/payroll/runs', b);
    expect(await run({ period: '2026-13' })).toBe(400);
    expect(await run({ period: '2026-1' })).toBe(400);
    expect(await run({})).toBe(400);
    const sal = (b: object) => call(app, 'hr', 'put', `/api/payroll/salaries/${ID}`, { basic: 20000, ...b });
    expect(await sal({ basic: 0 })).toBe(400);
    expect(await sal({ basic: -5 })).toBe(400);
    expect(await sal({ basic: 20000.5 })).toBe(400);
    expect(await sal({ allowances: -1 })).toBe(400);
    expect(await sal({ fixedDeduction: 1.5 })).toBe(400);
    expect(await call(app, 'hr', 'put', '/api/payroll/salaries/nope', { basic: 20000 })).toBe(400);
    expect(await call(app, 'hr', 'patch', `/api/payroll/payslips/${ID}`, {})).toBe(400);
    expect(await call(app, 'hr', 'patch', `/api/payroll/payslips/${ID}`, { bonus: -1 })).toBe(400);
    const pay = (b: object) => call(app, 'cashier', 'post', `/api/payroll/payslips/${ID}/pay`, { method: 'CASH', ...b });
    expect(await pay({ method: 'CHEQUE' })).toBe(400);
    expect(await pay({ paidOn: '2026-02-30' })).toBe(400);
    expect(await call(app, 'cashier', 'post', `/api/payroll/payslips/${ID}/void-payment`, { reason: 'x' })).toBe(400);
  });

  it('the school and the user come from the token only', async () => {
    const { app, calls } = build();
    await request(app).post('/api/payroll/runs').set('Authorization', await bearer('hr', SCHOOL_A, 'u-1')).send({ period: '2026-10', schoolId: 'evil' });
    expect(calls.find((c) => c.name === 'createRun')!.args).toEqual([SCHOOL_A, 'u-1', '2026-10']);
  });

  it('one payslip for printing: HR and accountants by id, anybody for their own', async () => {
    const { app, calls } = build();
    expect(await call(app, 'viewer', 'get', `/api/payroll/payslips/${ID}`)).toBe(200);
    expect(await call(app, 'none', 'get', `/api/payroll/payslips/${ID}`)).toBe(403);
    expect(await call(app, 'manageOnly', 'get', `/api/payroll/payslips/${ID}`)).toBe(403);
    expect((await request(app).get(`/api/payroll/my/${ID}`)).status).toBe(401);
    expect((await request(app).get(`/api/payroll/my/${ID}`).set('Authorization', await bearer('none', SCHOOL_A, 'u-7'))).status).toBe(200);
    expect(calls.find((c) => c.name === 'mySlip')!.args).toEqual([SCHOOL_A, 'u-7', ID]);
    expect(await call(app, 'viewer', 'get', '/api/payroll/payslips/nope')).toBe(400);
    expect(await call(app, 'none', 'get', '/api/payroll/my/nope')).toBe(400);
  });
});
