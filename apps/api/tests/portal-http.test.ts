import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import { monthRange, type PortalApi } from '../src/modules/portal/portal.service';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const ID = '44444444-4444-4444-8444-444444444444';
const V = '55555555-5555-4555-8555-555555555555';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = { parent: ['portal.own.read'], teacher: ['student.read', 'homework.read'] };
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A, userId = 'actor') => `Bearer ${(await tokens.sign({ userId, schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const portal = {
    children: rec('children', { viewer: 'PARENT', guardianName: null, children: [] }), childHomework: rec('childHomework', []),
    childAttendance: rec('childAttendance'), childResults: rec('childResults', []), childFees: rec('childFees'), childVoucher: rec('childVoucher'),
    childTimetable: rec('childTimetable', null), calendar: rec('calendar', []), childLibrary: rec('childLibrary', { loans: [], unpaidFine: 0 }), childTransport: rec('childTransport', { assignment: null }), childHostel: rec('childHostel', { allocation: null }),
  } as unknown as PortalApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    portal,
  });
  return { app, calls };
}
const get = async (app: ReturnType<typeof build>['app'], role: string, url: string, userId = 'mum') =>
  (await request(app).get(url).set('Authorization', await bearer(role, SCHOOL_A, userId))).status;

const routes = [
  `/api/portal/children/${ID}/attendance?month=2026-11`, `/api/portal/children/${ID}/results`, `/api/portal/children/${ID}/fees`,
  `/api/portal/children/${ID}/fees/${V}`, `/api/portal/children/${ID}/timetable`, `/api/portal/children/${ID}/library`, `/api/portal/children/${ID}/transport`, `/api/portal/children/${ID}/hostel`, '/api/portal/calendar',
];

describe('portal routes', () => {
  it('need sign-in, a school and portal.own.read (staff are kept out)', async () => {
    const { app, calls } = build();
    for (const url of routes) {
      expect((await request(app).get(url)).status).toBe(401);
      expect(await get(app, 'teacher', url)).toBe(403);
      expect((await request(app).get(url).set('Authorization', await bearer('parent', null))).status).toBe(403);
    }
    expect(calls).toHaveLength(0);
  });

  it('pass the school and user from the token, never from the request', async () => {
    const { app, calls } = build();
    for (const url of routes) expect(await get(app, 'parent', `${url}${url.includes('?') ? '&' : '?'}userId=someone-else&schoolId=x`)).toBeLessThan(500);
    const own = calls.filter((c) => c.name !== 'calendar');
    expect(own.length).toBe(8);
    for (const c of own) expect(c.args.slice(0, 3)).toEqual([SCHOOL_A, 'mum', ID]);
    expect(calls.find((c) => c.name === 'childAttendance')!.args[3]).toBe('2026-11');
    expect(calls.find((c) => c.name === 'childVoucher')!.args[3]).toBe(V);
  });

  it('validate ids, month and the calendar range', async () => {
    const { app, calls } = build();
    expect(await get(app, 'parent', '/api/portal/children/not-a-uuid/results')).toBe(400);
    expect(await get(app, 'parent', `/api/portal/children/${ID}/fees/not-a-uuid`)).toBe(400);
    expect(await get(app, 'parent', `/api/portal/children/${ID}/attendance`)).toBe(400);
    expect(await get(app, 'parent', `/api/portal/children/${ID}/attendance?month=2026-13`)).toBe(400);
    expect(await get(app, 'parent', '/api/portal/calendar?from=2026-11-10&to=2026-11-01')).toBe(400);
    expect(await get(app, 'parent', '/api/portal/calendar?from=2026-13-01')).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe('monthRange', () => {
  it('gives the first and last day, including leap years', () => {
    expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthRange('2026-12').to).toBe('2026-12-31');
  });
});
