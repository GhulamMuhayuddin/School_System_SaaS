import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AcademicsApi } from '../src/modules/academics/academics.types';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import type { StudentsApi } from '../src/modules/students/students.types';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const SCHOOL_B = '22222222-2222-4222-8222-222222222222';
const CLASS = '33333333-3333-4333-8333-333333333333';
const STU = '44444444-4444-4444-8444-444444444444';
const LINK = '55555555-5555-4555-8555-555555555555';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = {
  admin: ['student.read', 'student.create', 'student.update', 'student.delete', 'student.withdraw', 'academic.read', 'academic.manage'],
  teacher: ['student.read', 'academic.read'],
  officer: ['student.read', 'student.create', 'student.update'], // admission officer: no delete/withdraw, no academic.*
  super: ['platform.school.manage'],
};
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A) =>
  `Bearer ${(await tokens.sign({ userId: 'actor', schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const students = {
    options: rec('options'), list: rec('list', { students: [], total: 0 }), get: rec('get'), create: rec('create'), update: rec('update'),
    withdraw: rec('withdraw'), reinstate: rec('reinstate'), remove: rec('remove', undefined), addGuardian: rec('addGuardian'),
    updateGuardian: rec('updateGuardian'), removeGuardian: rec('removeGuardian'),
  } as unknown as StudentsApi;
  const academics = {
    listClasses: rec('listClasses', []), createClass: rec('createClass'), updateClass: rec('updateClass'), deleteClass: rec('deleteClass', undefined),
    createSection: rec('createSection'), updateSection: rec('updateSection'), deleteSection: rec('deleteSection', undefined),
  } as unknown as AcademicsApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    students, academics,
  });
  return { app, calls };
}

const guardian = { name: 'Ahmed Khan', phone: '0300-1234567', relation: 'FATHER' };
const goodStudent = { firstName: 'Ali', lastName: 'Khan', gender: 'MALE', dateOfBirth: '2015-05-20', classId: CLASS, admissionDate: '2026-04-01', guardians: [guardian] };

describe('/api/students access control', () => {
  it('needs a token with a school, and the right permission per action', async () => {
    const { app, calls } = build();
    expect((await request(app).get('/api/students')).status).toBe(401);
    expect((await request(app).get('/api/students').set('Authorization', await bearer('super', null))).status).toBe(403);
    const as = async (role: string, m: 'get' | 'post' | 'patch' | 'delete', url: string, body?: object) =>
      (await request(app)[m](url).set('Authorization', await bearer(role)).send(body)).status;
    expect(await as('teacher', 'get', '/api/students')).toBe(200);
    expect(await as('teacher', 'post', '/api/students', goodStudent)).toBe(403);
    expect(await as('teacher', 'patch', `/api/students/${STU}`, { firstName: 'X' })).toBe(403);
    expect(await as('officer', 'post', '/api/students', goodStudent)).toBe(201);
    expect(await as('officer', 'delete', `/api/students/${STU}`)).toBe(403);
    expect(await as('officer', 'post', `/api/students/${STU}/withdraw`, { status: 'WITHDRAWN', date: '2026-10-01' })).toBe(403);
    expect(await as('admin', 'post', `/api/students/${STU}/withdraw`, { status: 'WITHDRAWN', date: '2026-10-01' })).toBe(200);
    expect(await as('admin', 'delete', `/api/students/${STU}`)).toBe(204);
    expect(calls.some((c) => c.name === 'remove')).toBe(true);
  });
  it('always uses the school from the token', async () => {
    const { app, calls } = build();
    await request(app).get(`/api/students?schoolId=${SCHOOL_B}`).set('Authorization', await bearer('admin'));
    await request(app).post('/api/students').set('Authorization', await bearer('admin')).send({ ...goodStudent, schoolId: SCHOOL_B });
    expect(calls[0].args[0]).toBe(SCHOOL_A);
    expect(calls[1].args[0]).toBe(SCHOOL_A);
    expect(JSON.stringify(calls[1].args[1])).not.toContain(SCHOOL_B);
  });
});

describe('/api/students validation', () => {
  it('rejects bad student input before the service is called', async () => {
    const { app, calls } = build();
    const auth = await bearer('admin');
    const post = (body: object) => request(app).post('/api/students').set('Authorization', auth).send(body);
    expect((await post({ ...goodStudent, guardians: [] })).status).toBe(400);
    expect((await post({ ...goodStudent, guardians: [{ ...guardian, phone: 'abc' }] })).status).toBe(400);
    expect((await post({ ...goodStudent, guardians: [{ ...guardian, isPrimary: true }, { ...guardian, name: 'B', isPrimary: true }] })).status).toBe(400);
    expect((await post({ ...goodStudent, dateOfBirth: '2999-01-01' })).status).toBe(400);
    expect((await post({ ...goodStudent, dateOfBirth: '2015-13-45' })).status).toBe(400);
    expect((await post({ ...goodStudent, gender: 'X' })).status).toBe(400);
    expect((await post({ ...goodStudent, classId: 'nope' })).status).toBe(400);
    expect((await post({ ...goodStudent, firstName: ' ' })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it('normalises empty optional fields to null and validates the other routes', async () => {
    const { app, calls } = build();
    const auth = await bearer('admin');
    const send = (m: 'post' | 'patch', url: string, body: object) => request(app)[m](url).set('Authorization', auth).send(body);
    expect((await send('post', '/api/students', { ...goodStudent, phone: '', address: '', guardians: [{ ...guardian, email: '' }] })).status).toBe(201);
    const input = calls[0].args[1] as { phone: null; address: null; guardians: { email: null }[] };
    expect(input.phone).toBeNull();
    expect(input.address).toBeNull();
    expect(input.guardians[0].email).toBeNull();
    expect((await send('patch', `/api/students/${STU}`, {})).status).toBe(400);
    expect((await send('patch', `/api/students/${STU}`, { sectionId: null })).status).toBe(200);
    expect((await send('post', `/api/students/${STU}/withdraw`, { status: 'ACTIVE', date: '2026-10-01' })).status).toBe(400);
    expect((await send('patch', `/api/students/${STU}/guardians/${LINK}`, { phone: '!!' })).status).toBe(400);
    expect((await send('patch', `/api/students/${STU}/guardians/${LINK}`, { isPrimary: true })).status).toBe(200);
    expect((await request(app).get('/api/students?limit=99999').set('Authorization', auth)).status).toBe(400);
  });
});

describe('/api/academics', () => {
  it('reads with academic.read, changes need academic.manage, validates input', async () => {
    const { app } = build();
    const run = async (role: string, m: 'get' | 'post' | 'patch' | 'delete', url: string, body?: object) =>
      (await request(app)[m](url).set('Authorization', await bearer(role)).send(body)).status;
    expect(await run('teacher', 'get', '/api/academics/classes')).toBe(200);
    expect(await run('officer', 'get', '/api/academics/classes')).toBe(403);
    expect(await run('teacher', 'post', '/api/academics/classes', { name: 'Class 1' })).toBe(403);
    expect(await run('admin', 'post', '/api/academics/classes', { name: '  ' })).toBe(400);
    expect(await run('admin', 'post', '/api/academics/classes', { name: 'Class 1', level: 1 })).toBe(201);
    expect(await run('admin', 'post', `/api/academics/classes/${CLASS}/sections`, { name: 'A', capacity: 0 })).toBe(400);
    expect(await run('admin', 'post', `/api/academics/classes/${CLASS}/sections`, { name: 'A', capacity: 40 })).toBe(201);
    expect(await run('admin', 'patch', `/api/academics/sections/${STU}`, {})).toBe(400);
    expect(await run('admin', 'delete', `/api/academics/classes/${CLASS}`)).toBe(204);
  });
});
