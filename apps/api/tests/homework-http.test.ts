import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import type { HomeworkApi } from '../src/modules/homework/homework.types';
import type { PortalApi } from '../src/modules/portal/portal.service';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const ID = '44444444-4444-4444-8444-444444444444';
const ID2 = '55555555-5555-4555-8555-555555555555';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = {
  viewer: ['homework.read', 'academic.read'], // e.g. principal
  teacher: ['homework.read', 'homework.manage', 'academic.read'],
  admin: ['homework.read', 'homework.manage', 'academic.read', 'academic.manage'],
  parent: ['homework.read', 'portal.own.read'], // holds homework.read but must not reach the staff routes
  none: ['student.read'],
};
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A, userId = 'actor') => `Bearer ${(await tokens.sign({ userId, schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const homework = { list: rec('list', []), create: rec('create'), get: rec('get'), update: rec('update'), remove: rec('remove', undefined), saveSubmissions: rec('saveSubmissions') } as unknown as HomeworkApi;
  const portal = { children: rec('children', { guardianName: null, children: [] }), childHomework: rec('childHomework', []) } as unknown as PortalApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    homework, portal,
  });
  return { app, calls };
}
type Method = 'get' | 'put' | 'post' | 'patch' | 'delete';
const call = async (app: ReturnType<typeof build>['app'], role: string, m: Method, url: string, body?: object) =>
  (await request(app)[m](url).set('Authorization', await bearer(role)).send(body)).status;

const create = { sectionId: ID, subjectId: ID2, title: 'Chapter 3 exercise', dueDate: '2026-11-10' };
const submissions = { entries: [{ studentId: ID, status: 'SUBMITTED', marks: 8 }] };

describe('homework routes', () => {
  it('needs sign-in, a school and homework + academic read; parents are kept out', async () => {
    const { app } = build();
    expect((await request(app).get('/api/homework')).status).toBe(401);
    expect((await request(app).get('/api/homework').set('Authorization', await bearer('viewer', null))).status).toBe(403);
    expect(await call(app, 'none', 'get', '/api/homework')).toBe(403);
    expect(await call(app, 'parent', 'get', '/api/homework')).toBe(403);
    expect(await call(app, 'parent', 'get', `/api/homework/${ID}`)).toBe(403);
  });

  it('viewing and writing are separate permissions', async () => {
    const { app } = build();
    for (const url of ['/api/homework', `/api/homework/${ID}`]) expect(await call(app, 'viewer', 'get', url), url).toBe(200);
    const writes: [Method, string, object?][] = [['post', '/api/homework', create], ['patch', `/api/homework/${ID}`, { title: 'New title' }], ['delete', `/api/homework/${ID}`], ['put', `/api/homework/${ID}/submissions`, submissions]];
    for (const [m, url, body] of writes) {
      expect(await call(app, 'viewer', m, url, body), `viewer ${m} ${url}`).toBe(403);
      expect([200, 201, 204], `teacher ${m} ${url}`).toContain(await call(app, 'teacher', m, url, body));
    }
  });

  it('takes the school and the user from the token and tells the service whether the caller may work with any section', async () => {
    const { app, calls } = build();
    await request(app).post('/api/homework').set('Authorization', await bearer('teacher', SCHOOL_A, 'user-7')).send({ ...create, schoolId: 'evil' });
    const c = calls.find((x) => x.name === 'create')!;
    expect(c.args[0]).toBe(SCHOOL_A);
    expect(c.args[1]).toEqual({ userId: 'user-7', canManage: false });
    expect(JSON.stringify(c.args[2])).not.toContain('evil');
    await request(app).get('/api/homework').set('Authorization', await bearer('admin', SCHOOL_A, 'boss'));
    expect(calls.find((x) => x.name === 'list')!.args[2]).toEqual({ userId: 'boss', canManage: true });
  });

  it('turns mine=true into a boolean and passes filters on', async () => {
    const { app, calls } = build();
    await request(app).get(`/api/homework?mine=true&classId=${ID}&from=2026-11-01&to=2026-11-30`).set('Authorization', await bearer('teacher'));
    const f = calls.find((x) => x.name === 'list')!.args[1] as Record<string, unknown>;
    expect(f).toMatchObject({ mine: true, classId: ID, from: '2026-11-01', to: '2026-11-30' });
  });

  it('refuses bad input with 400 and never reaches the service', async () => {
    const { app, calls } = build();
    const bad: [Method, string, object?][] = [
      ['post', '/api/homework', { ...create, title: 'ab' }], ['post', '/api/homework', { ...create, sectionId: 'nope' }], ['post', '/api/homework', { ...create, dueDate: '2026-02-30' }],
      ['post', '/api/homework', { ...create, dueDate: '10/11/2026' }], ['post', '/api/homework', { ...create, assignedDate: '2026-13-01' }], ['post', '/api/homework', { ...create, maxMarks: 0 }],
      ['post', '/api/homework', { ...create, maxMarks: 1001 }], ['post', '/api/homework', { ...create, maxMarks: 5.5 }], ['post', '/api/homework', { ...create, title: 'x'.repeat(121) }],
      ['post', '/api/homework', { ...create, description: 'x'.repeat(2001) }], ['patch', `/api/homework/${ID}`, {}], ['patch', '/api/homework/not-a-uuid', { title: 'Fine title' }],
      ['put', `/api/homework/${ID}/submissions`, { entries: [] }], ['put', `/api/homework/${ID}/submissions`, { entries: [{ studentId: ID, status: 'DONE' }] }],
      ['put', `/api/homework/${ID}/submissions`, { entries: [{ studentId: ID, status: 'LATE', marks: -1 }] }], ['put', `/api/homework/${ID}/submissions`, { entries: [{ studentId: ID, status: 'LATE', marks: 2.5 }] }],
      ['put', `/api/homework/${ID}/submissions`, { entries: [{ studentId: 'x', status: 'LATE' }] }],
      ['get', '/api/homework?from=2026-11-10&to=2026-11-01'], ['get', '/api/homework?from=2026-02-30'], ['get', '/api/homework?classId=zzz'], ['get', '/api/homework?mine=maybe'],
    ];
    for (const [m, url, body] of bad) expect(await call(app, 'teacher', m, url, body), `${m} ${url} ${JSON.stringify(body)}`).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe('parent portal homework', () => {
  it('needs portal.own.read, uses the token for the guardian and validates input', async () => {
    const { app, calls } = build();
    expect(await call(app, 'teacher', 'get', `/api/portal/children/${ID}/homework`)).toBe(403);
    expect((await request(app).get(`/api/portal/children/${ID}/homework?from=2026-11-01`).set('Authorization', await bearer('parent', SCHOOL_A, 'mum'))).status).toBe(200);
    const c = calls.find((x) => x.name === 'childHomework')!;
    expect(c.args.slice(0, 3)).toEqual([SCHOOL_A, 'mum', ID]);
    expect(c.args[3]).toEqual({ from: '2026-11-01' });
    expect(await call(app, 'parent', 'get', '/api/portal/children/not-a-uuid/homework')).toBe(400);
    expect(await call(app, 'parent', 'get', `/api/portal/children/${ID}/homework?from=2026-11-10&to=2026-11-01`)).toBe(400);
  });
});
