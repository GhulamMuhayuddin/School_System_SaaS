import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthApi, AuthLimits, SessionResult, SessionUser } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import type { RolesApi } from '../src/modules/roles/roles.service';
import { AppError } from '../src/utils/errors';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const SCHOOL_B = '22222222-2222-4222-8222-222222222222';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const user: SessionUser = {
  id: 'u1', email: 'a@example.com', firstName: 'A', lastName: 'B', preferredLang: 'en',
  role: { id: 'role-admin', key: 'school_admin', name: 'School Administrator' }, school: { id: SCHOOL_A, name: 'A', code: 'a' }, permissions: [],
};
const session: SessionResult = { accessToken: 'access-token-value', expiresInSeconds: 900, refreshToken: 'REFRESH_SECRET_VALUE', refreshExpiresAt: new Date(Date.now() + 3_600_000), user };
const rolePermissions: Record<string, string[]> = { 'role-admin': ['school.role.manage'], 'role-teacher': ['student.read'] };

interface Calls { refresh: (string | undefined)[]; logout: (string | undefined)[]; forgot: string[]; roles: string[] }

function build(options: { secure?: boolean; limits?: Partial<AuthLimits>; service?: Partial<AuthApi> } = {}) {
  const calls: Calls = { refresh: [], logout: [], forgot: [], roles: [] };
  const service: AuthApi = {
    login: async () => session,
    refresh: async (raw) => {
      calls.refresh.push(raw);
      if (!raw) throw new AppError(401, 'UNAUTHORIZED', 'Your session has ended');
      return session;
    },
    logout: async (raw) => { calls.logout.push(raw); },
    logoutAll: async () => {},
    forgotPassword: async (email) => { calls.forgot.push(email); },
    resetPassword: async () => {},
    changePassword: async () => {},
    getProfile: async () => user,
    ...options.service,
  };
  const roles: RolesApi = { listRoles: async (schoolId) => { calls.roles.push(schoolId); return []; } };
  const app = createApp({
    logger: pino({ level: 'silent' }),
    corsOrigins: [],
    checkDatabase: async () => {},
    auth: {
      service,
      verifyAccessToken: (t) => tokens.verify(t),
      permissions: { get: async (roleId) => new Set(rolePermissions[roleId] ?? []) },
      cookie: { name: 'nexora_rt', secure: options.secure ?? false },
      limits: options.limits,
    },
    roles,
  });
  return { app, calls };
}

const bearer = async (c: { userId?: string; schoolId?: string | null; roleId: string; roleKey?: string }) =>
  `Bearer ${(await tokens.sign({ userId: c.userId ?? 'u1', schoolId: c.schoolId === undefined ? SCHOOL_A : c.schoolId, roleId: c.roleId, roleKey: c.roleKey ?? 'x' })).token}`;
const cookies = (res: request.Response): string[] => (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];

describe('POST /api/auth/login', () => {
  it('validates the body before calling the service', async () => {
    const { app } = build();
    expect((await request(app).post('/api/auth/login').send({ email: 'nope', password: 'x' })).status).toBe(400);
    const res = await request(app).post('/api/auth/login').send({ email: 'a@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns the access token and user, and keeps the refresh token only in an httpOnly cookie', async () => {
    const { app } = build();
    const res = await request(app).post('/api/auth/login').send({ email: 'A@Example.com', password: 'secret' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe('access-token-value');
    expect(res.body.user.email).toBe('a@example.com');
    expect(JSON.stringify(res.body)).not.toContain('REFRESH_SECRET_VALUE');
    const cookie = cookies(res).find((c) => c.startsWith('nexora_rt='));
    expect(cookie).toContain('REFRESH_SECRET_VALUE');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/auth/i);
    expect(cookie).not.toMatch(/Secure/i);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('adds the Secure flag when configured for HTTPS', async () => {
    const res = await request(build({ secure: true }).app).post('/api/auth/login').send({ email: 'a@example.com', password: 'x' });
    expect(cookies(res).find((c) => c.startsWith('nexora_rt='))).toMatch(/Secure/i);
  });

  it('passes service errors through in the standard error format', async () => {
    const { app } = build({ service: { login: async () => { throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'); } } });
    const res = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'x' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('is rate limited', async () => {
    const { app } = build({ limits: { login: { windowMs: 60_000, limit: 2 } } });
    const attempt = () => request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'x' });
    expect((await attempt()).status).toBe(200);
    expect((await attempt()).status).toBe(200);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('refresh and logout', () => {
  it('refresh reads the cookie, and clears it when the session is rejected', async () => {
    const { app, calls } = build();
    const rejected = await request(app).post('/api/auth/refresh');
    expect(rejected.status).toBe(401);
    expect(cookies(rejected).find((c) => c.startsWith('nexora_rt='))).toMatch(/Expires=Thu, 01 Jan 1970/i);
    const ok = await request(app).post('/api/auth/refresh').set('Cookie', 'nexora_rt=abc123');
    expect(ok.status).toBe(200);
    expect(calls.refresh).toEqual([undefined, 'abc123']);
  });

  it('logout always answers 204 and clears the cookie', async () => {
    const { app, calls } = build();
    const res = await request(app).post('/api/auth/logout').set('Cookie', 'nexora_rt=abc123');
    expect(res.status).toBe(204);
    expect(calls.logout).toEqual(['abc123']);
    expect(cookies(res).find((c) => c.startsWith('nexora_rt='))).toMatch(/Expires=Thu, 01 Jan 1970/i);
    expect((await request(app).post('/api/auth/logout')).status).toBe(204);
  });
});

describe('access token protection', () => {
  it('GET /api/auth/me needs a valid bearer token', async () => {
    const { app } = build();
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.token')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Basic abc')).status).toBe(401);
    const ok = await request(app).get('/api/auth/me').set('Authorization', await bearer({ roleId: 'role-admin' }));
    expect(ok.status).toBe(200);
    expect(ok.body.user.id).toBe('u1');
  });

  it('rejects an expired token and a tampered token', async () => {
    const { app } = build();
    const old = new AccessTokenService('t'.repeat(40), 15, () => Date.now() - 3_600_000);
    const expired = (await old.sign({ userId: 'u1', schoolId: SCHOOL_A, roleId: 'role-admin', roleKey: 'x' })).token;
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`)).status).toBe(401);
    const valid = (await bearer({ roleId: 'role-admin' })).slice(0, -3);
    expect((await request(app).get('/api/auth/me').set('Authorization', `${valid}abc`)).status).toBe(401);
  });

  it('change-password and logout-all require authentication', async () => {
    const { app } = build();
    expect((await request(app).post('/api/auth/change-password').send({ currentPassword: 'a', newPassword: 'longenough1' })).status).toBe(401);
    expect((await request(app).post('/api/auth/logout-all')).status).toBe(401);
  });
});

describe('password reset endpoints', () => {
  it('forgot-password gives the same answer for any email and lowercases it', async () => {
    const { app, calls } = build();
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'Someone@Example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/If an account exists/);
    expect(calls.forgot).toEqual(['someone@example.com']);
    expect((await request(app).post('/api/auth/forgot-password').send({ email: 'bad' })).status).toBe(400);
  });

  it('reset-password validates the token and enforces the password length', async () => {
    const { app } = build();
    const token = 'x'.repeat(43);
    expect((await request(app).post('/api/auth/reset-password').send({ token: 'short', password: 'longenough1' })).status).toBe(400);
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'short' })).status).toBe(400);
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'longenough1' })).status).toBe(204);
  });
});

describe('RBAC on /api/roles', () => {
  it('needs a token, the school.role.manage permission and a school account', async () => {
    const { app } = build();
    expect((await request(app).get('/api/roles')).status).toBe(401);
    expect((await request(app).get('/api/roles').set('Authorization', await bearer({ roleId: 'role-teacher' }))).status).toBe(403);
    expect((await request(app).get('/api/roles').set('Authorization', await bearer({ roleId: 'unknown-role' }))).status).toBe(403);
    // platform user (no school) is refused even if the role had the permission
    expect((await request(app).get('/api/roles').set('Authorization', await bearer({ roleId: 'role-admin', schoolId: null }))).status).toBe(403);
    expect((await request(app).get('/api/roles').set('Authorization', await bearer({ roleId: 'role-admin' }))).status).toBe(200);
  });

  it('takes the school from the verified token, never from the query string', async () => {
    const { app, calls } = build();
    await request(app).get(`/api/roles?schoolId=${SCHOOL_B}`).set('Authorization', await bearer({ roleId: 'role-admin' }));
    expect(calls.roles).toEqual([SCHOOL_A]);
  });

  it('GET /api/permissions lists school modules but not platform permissions', async () => {
    const { app } = build();
    const res = await request(app).get('/api/permissions').set('Authorization', await bearer({ roleId: 'role-admin' }));
    expect(res.status).toBe(200);
    expect(res.body.modules.student).toContain('read');
    expect(res.body.modules.platform).toBeUndefined();
  });
});
