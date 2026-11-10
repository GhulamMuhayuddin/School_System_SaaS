import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import type { TransportApi } from '../src/modules/transport/transport.types';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const ID = '44444444-4444-4444-8444-444444444444';
const ID2 = '55555555-5555-4555-8555-555555555555';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = { viewer: ['transport.read'], manager: ['transport.read', 'transport.manage'], manageOnly: ['transport.manage'], none: ['student.read'] };
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A, userId = 'actor') => `Bearer ${(await tokens.sign({ userId, schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const transport = {
    summary: rec('summary'), listVehicles: rec('listVehicles', []), createVehicle: rec('createVehicle'), updateVehicle: rec('updateVehicle'), listRoutes: rec('listRoutes', []),
    createRoute: rec('createRoute'), getRoute: rec('getRoute'), updateRoute: rec('updateRoute'), setStops: rec('setStops'), listRiders: rec('listRiders', { riders: [], truncated: false }),
    assign: rec('assign'), unassign: rec('unassign'), studentTransport: rec('studentTransport', { assignment: null }),
  } as unknown as TransportApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    transport,
  });
  return { app, calls };
}
type M = 'get' | 'post' | 'put' | 'patch' | 'delete';
const call = async (app: ReturnType<typeof build>['app'], role: string, m: M, url: string, body?: object) =>
  (await request(app)[m](url).set('Authorization', await bearer(role)).send(body)).status;

describe('transport routes: who may do what', () => {
  it('needs a login, a school and transport.read', async () => {
    const { app } = build();
    expect((await request(app).get('/api/transport/routes')).status).toBe(401);
    expect(await call(app, 'none', 'get', '/api/transport/routes')).toBe(403);
    expect(await call(app, 'viewer', 'get', '/api/transport/routes')).toBe(200);
    expect(await call(app, 'viewer', 'get', '/api/transport/summary')).toBe(200);
    expect(await call(app, 'viewer', 'get', '/api/transport/vehicles')).toBe(200);
    expect(await call(app, 'viewer', 'get', '/api/transport/riders?q=ali')).toBe(200);
    expect(await call(app, 'viewer', 'get', `/api/transport/students/${ID}`)).toBe(200);
    expect((await request(app).get('/api/transport/routes').set('Authorization', await bearer('viewer', null))).status).toBe(403);
  });

  it('changing anything needs read AND manage', async () => {
    const { app } = build();
    const route = { name: 'Model Town', monthlyFee: 2500, stops: [{ name: 'Gate', pickupTime: '07:00' }, { name: 'Market', pickupTime: '07:15' }] };
    expect(await call(app, 'viewer', 'post', '/api/transport/routes', route)).toBe(403);
    expect(await call(app, 'manageOnly', 'post', '/api/transport/routes', route)).toBe(403);
    expect(await call(app, 'manager', 'post', '/api/transport/routes', route)).toBe(201);
    expect(await call(app, 'manager', 'patch', `/api/transport/routes/${ID}`, { monthlyFee: 3000 })).toBe(200);
    expect(await call(app, 'viewer', 'patch', `/api/transport/routes/${ID}`, { monthlyFee: 3000 })).toBe(403);
    expect(await call(app, 'manager', 'put', `/api/transport/routes/${ID}/stops`, { stops: [{ name: 'Gate' }] })).toBe(200);
    expect(await call(app, 'viewer', 'put', `/api/transport/students/${ID}`, { routeId: ID, stopId: ID2 })).toBe(403);
    expect(await call(app, 'manager', 'put', `/api/transport/students/${ID}`, { routeId: ID, stopId: ID2 })).toBe(200);
    expect(await call(app, 'viewer', 'delete', `/api/transport/students/${ID}`)).toBe(403);
    expect(await call(app, 'manager', 'delete', `/api/transport/students/${ID}`)).toBe(204);
    expect(await call(app, 'viewer', 'post', '/api/transport/vehicles', { registrationNo: 'LEA-1234', capacity: 30 })).toBe(403);
    expect(await call(app, 'manager', 'post', '/api/transport/vehicles', { registrationNo: 'LEA-1234', capacity: 30 })).toBe(201);
  });

  it('validates routes, stops and vehicles', async () => {
    const { app } = build();
    const post = (b: object) => call(app, 'manager', 'post', '/api/transport/routes', b);
    expect(await post({ name: 'x' })).toBe(400);
    expect(await post({ name: 'Model Town', monthlyFee: -5 })).toBe(400);
    expect(await post({ name: 'Model Town', monthlyFee: 12.5 })).toBe(400);
    expect(await post({ name: 'Model Town', stops: [{ name: 'Gate', pickupTime: '7:00' }] })).toBe(400);
    expect(await post({ name: 'Model Town', stops: [{ name: 'Gate', pickupTime: '07:30' }, { name: 'Market', pickupTime: '07:10' }] })).toBe(400);
    expect(await post({ name: 'Model Town', stops: [{ name: '' }] })).toBe(400);
    expect(await call(app, 'manager', 'patch', `/api/transport/routes/${ID}`, {})).toBe(400);
    const veh = (b: object) => call(app, 'manager', 'post', '/api/transport/vehicles', b);
    expect(await veh({ registrationNo: 'LEA-1234', capacity: 0 })).toBe(400);
    expect(await veh({ registrationNo: 'LEA-1234', capacity: 500 })).toBe(400);
    expect(await veh({ registrationNo: 'LEA-1234', capacity: 30, driverPhone: 'call me' })).toBe(400);
    expect(await call(app, 'manager', 'put', `/api/transport/students/${ID}`, { routeId: 'nope', stopId: ID2 })).toBe(400);
    expect(await call(app, 'viewer', 'get', '/api/transport/routes/not-a-uuid')).toBe(400);
  });

  it('the school and the user come from the token only', async () => {
    const { app, calls } = build();
    await request(app).put(`/api/transport/students/${ID}`).set('Authorization', await bearer('manager', SCHOOL_A, 'u-1')).send({ routeId: ID, stopId: ID2, schoolId: 'evil' });
    expect(calls.find((c) => c.name === 'assign')!.args).toEqual([SCHOOL_A, 'u-1', ID, ID, ID2]);
  });
});
