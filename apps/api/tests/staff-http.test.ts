import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import type { SchoolApi } from '../src/modules/school/school.types';
import type { StaffApi } from '../src/modules/staff/staff.types';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const SCHOOL_B = '22222222-2222-4222-8222-222222222222';
const ID = '44444444-4444-4444-8444-444444444444';
const ROLE = '55555555-5555-4555-8555-555555555555';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = {
  hr: ['staff.read', 'staff.create', 'staff.update', 'staff.delete'],
  clerk: ['staff.read'],
  admin: ['staff.read', 'school.role.manage'],
  teacher: ['student.read'],
};
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A) => `Bearer ${(await tokens.sign({ userId: 'actor', schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const staff = {
    list: rec('list', { staff: [], total: 0 }), get: rec('get'), create: rec('create'), update: rec('update'),
    leave: rec('leave'), reinstate: rec('reinstate'), remove: rec('remove'),
  } as unknown as StaffApi;
  const school = { createStaffAccount: rec('createStaffAccount') } as unknown as SchoolApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    staff, school,
  });
  return { app, calls };
}

const good = { firstName: 'Sana', lastName: 'Iqbal', gender: 'FEMALE', phone: '0300-1234567', category: 'TEACHING', designation: 'Maths Teacher', joiningDate: '2026-04-01' };

describe('/api/staff', () => {
  it('splits permissions: only HR writes, a clerk reads, a teacher sees nothing', async () => {
    const { app } = build();
    const call = async (role: string, m: 'get' | 'post' | 'patch' | 'delete', url: string, body?: object) =>
      (await request(app)[m](url).set('Authorization', await bearer(role)).send(body)).status;
    expect(await call('teacher', 'get', '/api/staff')).toBe(403);
    expect(await call('clerk', 'get', '/api/staff')).toBe(200);
    expect(await call('clerk', 'post', '/api/staff', good)).toBe(403);
    expect(await call('hr', 'post', '/api/staff', good)).toBe(201);
    expect(await call('clerk', 'patch', `/api/staff/${ID}`, { designation: 'X' })).toBe(403);
    expect(await call('hr', 'patch', `/api/staff/${ID}`, { designation: 'X' })).toBe(200);
    expect(await call('hr', 'post', `/api/staff/${ID}/leave`, { date: '2026-10-01' })).toBe(200);
    expect(await call('clerk', 'delete', `/api/staff/${ID}`)).toBe(403);
    expect(await call('hr', 'delete', `/api/staff/${ID}`)).toBe(204);
  });
  it('needs a school token and never trusts a school id from the body', async () => {
    const { app, calls } = build();
    expect((await request(app).get('/api/staff')).status).toBe(401);
    expect((await request(app).get('/api/staff').set('Authorization', await bearer('hr', null))).status).toBe(403);
    await request(app).post('/api/staff').set('Authorization', await bearer('hr')).send({ ...good, schoolId: SCHOOL_B });
    expect(calls[0].args[0]).toBe(SCHOOL_A);
    expect(JSON.stringify(calls[0].args[1])).not.toContain(SCHOOL_B);
  });
  it('validates input', async () => {
    const { app } = build();
    const post = async (body: object) => (await request(app).post('/api/staff').set('Authorization', await bearer('hr')).send(body)).status;
    expect(await post({ ...good, phone: 'abc' })).toBe(400);
    expect(await post({ ...good, category: 'BOSS' })).toBe(400);
    expect(await post({ ...good, joiningDate: '01-04-2026' })).toBe(400);
    expect(await post({ ...good, cnic: '123' })).toBe(400);
    expect(await post({ ...good, cnic: '35202-1234567-1' })).toBe(201);
  });
  it('creating a login needs school.role.manage and a role id', async () => {
    const { app, calls } = build();
    const post = async (role: string, body: object) => (await request(app).post(`/api/school/staff/${ID}/account`).set('Authorization', await bearer(role)).send(body)).status;
    const body = { email: 'sana@school.test', password: 'a-long-password-1', roleId: ROLE };
    expect(await post('hr', body)).toBe(403);
    expect(await post('admin', { ...body, password: 'short' })).toBe(400);
    expect(await post('admin', { ...body, roleId: 'nope' })).toBe(400);
    expect(await post('admin', body)).toBe(201);
    expect(calls.at(-1)?.name).toBe('createStaffAccount');
  });
});
