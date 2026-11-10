import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import type { HostelApi } from '../src/modules/hostel/hostel.types';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const ID = '44444444-4444-4444-8444-444444444444';
const ID2 = '55555555-5555-4555-8555-555555555555';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = { viewer: ['hostel.read'], manager: ['hostel.read', 'hostel.manage'], manageOnly: ['hostel.manage'], none: ['student.read'] };
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A, userId = 'actor') => `Bearer ${(await tokens.sign({ userId, schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const hostel = {
    summary: rec('summary'), listHostels: rec('listHostels', []), createHostel: rec('createHostel'), updateHostel: rec('updateHostel'), listRooms: rec('listRooms', []),
    createRoom: rec('createRoom'), updateRoom: rec('updateRoom'), listResidents: rec('listResidents', { residents: [], truncated: false }),
    assign: rec('assign'), unassign: rec('unassign'), studentHostel: rec('studentHostel', { allocation: null }),
  } as unknown as HostelApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    hostel,
  });
  return { app, calls };
}
type M = 'get' | 'post' | 'put' | 'patch' | 'delete';
const call = async (app: ReturnType<typeof build>['app'], role: string, m: M, url: string, body?: object) =>
  (await request(app)[m](url).set('Authorization', await bearer(role)).send(body)).status;

describe('hostel routes: who may do what', () => {
  it('needs a login, a school and hostel.read', async () => {
    const { app } = build();
    expect((await request(app).get('/api/hostel/hostels')).status).toBe(401);
    expect(await call(app, 'none', 'get', '/api/hostel/hostels')).toBe(403);
    for (const url of ['/api/hostel/hostels', '/api/hostel/summary', '/api/hostel/rooms', '/api/hostel/rooms?hostelId=' + ID, '/api/hostel/residents?q=ali', `/api/hostel/students/${ID}`]) {
      expect(await call(app, 'viewer', 'get', url)).toBe(200);
    }
    expect((await request(app).get('/api/hostel/hostels').set('Authorization', await bearer('viewer', null))).status).toBe(403);
  });

  it('changing anything needs read AND manage', async () => {
    const { app } = build();
    const hostel = { name: 'Iqbal House', kind: 'BOYS', wardenName: 'Mr Khan', wardenPhone: '0300-1234567' };
    const room = { hostelId: ID, roomNo: 'A-1', floor: 1, beds: 4, monthlyFee: 6000 };
    expect(await call(app, 'viewer', 'post', '/api/hostel/hostels', hostel)).toBe(403);
    expect(await call(app, 'manageOnly', 'post', '/api/hostel/hostels', hostel)).toBe(403);
    expect(await call(app, 'manager', 'post', '/api/hostel/hostels', hostel)).toBe(201);
    expect(await call(app, 'manager', 'patch', `/api/hostel/hostels/${ID}`, { kind: 'MIXED' })).toBe(200);
    expect(await call(app, 'viewer', 'patch', `/api/hostel/hostels/${ID}`, { kind: 'MIXED' })).toBe(403);
    expect(await call(app, 'viewer', 'post', '/api/hostel/rooms', room)).toBe(403);
    expect(await call(app, 'manager', 'post', '/api/hostel/rooms', room)).toBe(201);
    expect(await call(app, 'manager', 'patch', `/api/hostel/rooms/${ID}`, { beds: 6 })).toBe(200);
    expect(await call(app, 'viewer', 'put', `/api/hostel/students/${ID}`, { roomId: ID2 })).toBe(403);
    expect(await call(app, 'manager', 'put', `/api/hostel/students/${ID}`, { roomId: ID2 })).toBe(200);
    expect(await call(app, 'viewer', 'delete', `/api/hostel/students/${ID}`)).toBe(403);
    expect(await call(app, 'manager', 'delete', `/api/hostel/students/${ID}`)).toBe(204);
  });

  it('validates hostels, rooms and allocations', async () => {
    const { app } = build();
    const h = (b: object) => call(app, 'manager', 'post', '/api/hostel/hostels', b);
    expect(await h({ name: 'x', kind: 'BOYS' })).toBe(400);
    expect(await h({ name: 'Iqbal House', kind: 'STAFF' })).toBe(400);
    expect(await h({ name: 'Iqbal House', kind: 'BOYS', wardenPhone: 'call me' })).toBe(400);
    expect(await call(app, 'manager', 'patch', `/api/hostel/hostels/${ID}`, {})).toBe(400);
    const r = (b: object) => call(app, 'manager', 'post', '/api/hostel/rooms', { hostelId: ID, roomNo: 'A-1', beds: 4, ...b });
    expect(await r({ beds: 0 })).toBe(400);
    expect(await r({ beds: 100 })).toBe(400);
    expect(await r({ monthlyFee: -1 })).toBe(400);
    expect(await r({ monthlyFee: 99.5 })).toBe(400);
    expect(await r({ roomNo: '' })).toBe(400);
    expect(await r({ hostelId: 'nope' })).toBe(400);
    expect(await call(app, 'manager', 'patch', `/api/hostel/rooms/${ID}`, {})).toBe(400);
    expect(await call(app, 'manager', 'put', `/api/hostel/students/${ID}`, { roomId: 'nope' })).toBe(400);
    expect(await call(app, 'viewer', 'get', '/api/hostel/rooms?hostelId=not-a-uuid')).toBe(400);
  });

  it('the school and the user come from the token only', async () => {
    const { app, calls } = build();
    await request(app).put(`/api/hostel/students/${ID}`).set('Authorization', await bearer('manager', SCHOOL_A, 'u-1')).send({ roomId: ID2, schoolId: 'evil' });
    expect(calls.find((c) => c.name === 'assign')!.args).toEqual([SCHOOL_A, 'u-1', ID, ID2]);
  });
});
