/**
 * Real end-to-end test of authentication, sessions, password reset, RBAC and tenant isolation
 * against PostgreSQL (migrations + `pnpm db:rls` + `pnpm db:seed` must have been run).
 * Run:  set RUN_DB_TESTS=1   (cmd, on its own line)   then   pnpm --filter @nexora/api test
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { AuthService } from '../src/modules/auth/auth.service';
import type { EmailMessage } from '../src/modules/auth/email';
import { PermissionResolver, loadRolePermissionKeys } from '../src/modules/auth/permission-resolver';
import { AccessTokenService } from '../src/modules/auth/tokens';
import { RolesService } from '../src/modules/roles/roles.service';
import { hashPassword } from '../src/utils/password';

const PASSWORD = 'Correct-Horse-9';
const NEW_PASSWORD = 'Another-Strong-Pass-7';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('authentication, RBAC and tenancy (PostgreSQL)', () => {
  let owner: PrismaClient;
  let runtime: PrismaClient;
  let api: ReturnType<typeof createApp>;
  let clockNow = Date.now();
  const sent: EmailMessage[] = [];
  const tag = `auth-${Date.now()}`;
  const emailOf = (label: string) => `${tag}.${label}@example.test`;

  let schoolA = '';
  let schoolB = '';
  let customRoleKeyB = '';

  const login = (label: string, password = PASSWORD, remember = false) =>
    request(api).post('/api/auth/login').send({ email: emailOf(label), password, remember });
  const refreshCookie = (res: request.Response): string => {
    const header = (res.headers['set-cookie'] as unknown as string[] | undefined)?.find((c) => c.startsWith('nexora_rt='));
    if (!header) throw new Error('no refresh cookie in response');
    return header.split(';')[0];
  };
  const refresh = (cookie: string) => request(api).post('/api/auth/refresh').set('Cookie', cookie);
  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });
  const waitForEmail = async (count: number) => {
    for (let i = 0; i < 50 && sent.length < count; i++) await new Promise((r) => setTimeout(r, 20));
  };

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

    const role = async (key: string) => (await owner.role.findFirstOrThrow({ where: { schoolId: null, key } })).id;
    const [adminRole, teacherRole, superRole] = await Promise.all([role('school_admin'), role('teacher'), role('super_admin')]);

    const a = await owner.school.create({ data: { name: 'Auth A', code: `${tag}-a` } });
    const b = await owner.school.create({ data: { name: 'Auth B', code: `${tag}-b` } });
    const c = await owner.school.create({ data: { name: 'Auth C', code: `${tag}-c`, status: 'SUSPENDED' } });
    schoolA = a.id;
    schoolB = b.id;
    customRoleKeyB = `${tag}-custom`;
    await owner.role.create({ data: { schoolId: b.id, key: customRoleKeyB, name: 'School B custom role' } });

    const hash = await hashPassword(PASSWORD);
    const mk = (label: string, roleId: string, schoolId: string | null, extra: object = {}) =>
      owner.user.create({ data: { email: emailOf(label), passwordHash: hash, firstName: label, lastName: 'Test', roleId, schoolId, ...extra } });
    await Promise.all([
      mk('admin-a', adminRole, a.id),
      mk('teacher-a', teacherRole, a.id),
      mk('admin-b', adminRole, b.id),
      mk('super', superRole, null),
      mk('lock', adminRole, a.id),
      mk('session', adminRole, a.id),
      mk('reset', adminRole, a.id),
      mk('expiry', adminRole, a.id),
      mk('change', adminRole, a.id),
      mk('suspended', adminRole, c.id),
      mk('inactive', adminRole, a.id, { status: 'INACTIVE' }),
    ]);

    const logger = pino({ level: 'silent' });
    const tokens = new AccessTokenService('i'.repeat(48), 15, () => clockNow);
    const permissions = new PermissionResolver((roleId) => loadRolePermissionKeys(runtime, roleId));
    const service = new AuthService({
      prisma: runtime,
      tokens,
      permissions,
      email: { send: async (message) => { sent.push(message); } },
      logger,
      clock: () => new Date(clockNow),
      config: { maxLoginAttempts: 3, lockoutMinutes: 15, sessionHours: 24, sessionDaysRemember: 30, resetTokenMinutes: 60, appBaseUrl: 'http://localhost:5173' },
    });
    const rule = { windowMs: 60_000, limit: 10_000 };
    api = createApp({
      logger,
      corsOrigins: [],
      checkDatabase: async () => {},
      auth: {
        service,
        verifyAccessToken: (t) => tokens.verify(t),
        permissions,
        cookie: { name: 'nexora_rt', secure: false },
        limits: { login: rule, forgotPassword: rule, resetPassword: rule, refresh: rule, changePassword: rule },
      },
      roles: new RolesService(runtime),
    });
  });

  afterAll(async () => {
    if (!owner || !runtime) return;
    await owner.user.deleteMany({ where: { email: { startsWith: tag } } }); // refresh/reset tokens cascade
    await owner.school.deleteMany({ where: { code: { startsWith: tag } } }); // custom roles cascade
    await owner.$disconnect();
    await runtime.$disconnect();
  });

  it('signs in with the correct password: access token in the body, refresh token only in an httpOnly cookie', async () => {
    const res = await login('admin-a');
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.school.id).toBe(schoolA);
    expect(res.body.user.role.key).toBe('school_admin');
    expect(res.body.user.permissions).toContain('school.role.manage');
    expect(JSON.stringify(res.body)).not.toContain(refreshCookie(res).split('=')[1]);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash/);
  });

  it('gives the same generic error for a wrong password and an unknown email', async () => {
    const wrong = await login('admin-a', 'Wrong-Password-1');
    const unknown = await request(api).post('/api/auth/login').send({ email: `nobody.${tag}@example.test`, password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('locks the account after repeated failures (even for the right password) until the lock expires', async () => {
    for (let i = 0; i < 3; i++) expect((await login('lock', 'Wrong-Password-1')).status).toBe(401);
    const locked = await login('lock');
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    clockNow += 16 * 60_000;
    expect((await login('lock')).status).toBe(200);
  });

  it('rotates refresh tokens and revokes the whole session when an old token is replayed later', async () => {
    const first = refreshCookie(await login('session'));
    const second = await refresh(first);
    expect(second.status).toBe(200);
    const secondCookie = refreshCookie(second);
    expect(secondCookie).not.toBe(first);

    clockNow += 5_000; // inside the grace window: treated as a tab race, session survives
    expect((await refresh(first)).status).toBe(401);
    const third = await refresh(secondCookie);
    expect(third.status).toBe(200);
    const thirdCookie = refreshCookie(third);

    clockNow += 60_000; // replay long after rotation: theft assumed
    expect((await refresh(first)).status).toBe(401);
    expect((await refresh(thirdCookie)).status).toBe(401);
  });

  it('logout ends the session', async () => {
    const cookie = refreshCookie(await login('admin-a'));
    expect((await request(api).post('/api/auth/logout').set('Cookie', cookie)).status).toBe(204);
    expect((await refresh(cookie)).status).toBe(401);
  });

  it('GET /api/auth/me returns the profile for school users and for the platform administrator', async () => {
    const school = await login('teacher-a');
    const me = await request(api).get('/api/auth/me').set(authed(school.body.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.user.role.key).toBe('teacher');
    expect(me.body.user.permissions).toContain('attendance.mark');
    expect(me.body.user.permissions).not.toContain('fee.collect');

    const platform = await login('super');
    const meSuper = await request(api).get('/api/auth/me').set(authed(platform.body.accessToken));
    expect(meSuper.status).toBe(200);
    expect(meSuper.body.user.school).toBeNull();
    expect(meSuper.body.user.permissions).toContain('platform.school.manage');
  });

  it('blocks users of a suspended school and inactive users', async () => {
    const suspended = await login('suspended');
    expect(suspended.status).toBe(403);
    expect(suspended.body.error.code).toBe('SCHOOL_SUSPENDED');
    const inactive = await login('inactive');
    expect(inactive.status).toBe(403);
    expect(inactive.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('password reset: one-time link, new password works, old password and old sessions stop working', async () => {
    const before = await login('reset');
    const oldSession = refreshCookie(before);
    const emailsBefore = sent.length;

    await request(api).post('/api/auth/forgot-password').send({ email: `ghost.${tag}@example.test` }).expect(200);
    await new Promise((r) => setTimeout(r, 100));
    expect(sent.length).toBe(emailsBefore); // unknown address: same answer, nothing sent

    const forgot = await request(api).post('/api/auth/forgot-password').send({ email: emailOf('reset') });
    expect(forgot.status).toBe(200);
    await waitForEmail(emailsBefore + 1);
    const token = /token=([A-Za-z0-9_-]+)/.exec(sent[sent.length - 1].text)?.[1];
    expect(token).toBeTruthy();

    expect((await request(api).post('/api/auth/reset-password').send({ token, password: 'short' })).status).toBe(400);
    expect((await request(api).post('/api/auth/reset-password').send({ token, password: NEW_PASSWORD })).status).toBe(204);

    expect((await login('reset')).status).toBe(401);
    expect((await login('reset', NEW_PASSWORD)).status).toBe(200);
    expect((await refresh(oldSession)).status).toBe(401);

    const reused = await request(api).post('/api/auth/reset-password').send({ token, password: 'Yet-Another-Pass-1' });
    expect(reused.status).toBe(400);
    expect(reused.body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  it('a reset link stops working after it expires', async () => {
    const emailsBefore = sent.length;
    await request(api).post('/api/auth/forgot-password').send({ email: emailOf('expiry') }).expect(200);
    await waitForEmail(emailsBefore + 1);
    const token = /token=([A-Za-z0-9_-]+)/.exec(sent[sent.length - 1].text)?.[1];
    clockNow += 2 * 60 * 60_000;
    const res = await request(api).post('/api/auth/reset-password').send({ token, password: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  it('change-password needs the current password and then ends every session', async () => {
    const signedIn = await login('change');
    const cookie = refreshCookie(signedIn);
    const headers = authed(signedIn.body.accessToken);
    const wrong = await request(api).post('/api/auth/change-password').set(headers).send({ currentPassword: 'Nope-Nope-1', newPassword: NEW_PASSWORD });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('CURRENT_PASSWORD_INCORRECT');
    expect((await request(api).post('/api/auth/change-password').set(headers).send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })).status).toBe(204);
    expect((await refresh(cookie)).status).toBe(401);
    expect((await login('change', NEW_PASSWORD)).status).toBe(200);
  });

  describe('RBAC and tenant isolation on /api/roles', () => {
    it('a School Administrator sees system roles and only their own school roles', async () => {
      const a = await login('admin-a');
      const res = await request(api).get('/api/roles').set(authed(a.body.accessToken));
      expect(res.status).toBe(200);
      const keys = res.body.roles.map((r: { key: string }) => r.key);
      expect(keys).toContain('teacher');
      expect(keys).not.toContain('super_admin');
      expect(keys).not.toContain(customRoleKeyB); // another school's custom role is invisible
    });

    it('another school sees its own custom role, and a schoolId in the query changes nothing', async () => {
      const b = await login('admin-b');
      const res = await request(api).get(`/api/roles?schoolId=${schoolA}`).set(authed(b.body.accessToken));
      expect(res.status).toBe(200);
      const roles = res.body.roles as { key: string; isCustom: boolean }[];
      expect(roles.find((r) => r.key === customRoleKeyB)?.isCustom).toBe(true);
      expect(schoolB).not.toBe(schoolA);
    });

    it('teachers and the platform administrator are refused, and anonymous callers get 401', async () => {
      const teacher = await login('teacher-a');
      expect((await request(api).get('/api/roles').set(authed(teacher.body.accessToken))).status).toBe(403);
      const platform = await login('super');
      expect((await request(api).get('/api/roles').set(authed(platform.body.accessToken))).status).toBe(403);
      expect((await request(api).get('/api/roles')).status).toBe(401);
    });
  });

  it('writes audit records for sign-ins, failures and lockouts', async () => {
    const lockUser = await owner.user.findUniqueOrThrow({ where: { email: emailOf('lock') } });
    const actions = (await owner.auditLog.findMany({ where: { userId: lockUser.id } })).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['auth.login_failed', 'auth.account_locked', 'auth.login_blocked', 'auth.login']));
  });
});
