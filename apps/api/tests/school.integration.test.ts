/**
 * Real database test of the School Admin service and its tenant isolation.
 * Needs migrations + `pnpm db:rls` + `pnpm db:seed`. Run:  set RUN_DB_TESTS=1   then   pnpm --filter @nexora/api test
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/utils/password';
import { SchoolService } from '../src/modules/school/school.service';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('school service (PostgreSQL)', () => {
  let owner: PrismaClient;
  let runtime: PrismaClient;
  let svc: SchoolService;
  const tag = `sch-${Date.now()}`;
  let a = '';
  let b = '';
  let adminA = '';
  let teacherRole = '';
  let adminRole = '';
  let newUser = '';

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    svc = new SchoolService(runtime);
    teacherRole = (await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'teacher' } })).id;
    adminRole = (await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'school_admin' } })).id;
    const hash = await hashPassword('Correct-Horse-9');
    const sa = await owner.school.create({ data: { name: `${tag} A`, code: `${tag}-a` } });
    const sb = await owner.school.create({ data: { name: `${tag} B`, code: `${tag}-b` } });
    a = sa.id; b = sb.id;
    adminA = (await owner.user.create({ data: { schoolId: a, roleId: adminRole, email: `${tag}.a@example.test`, passwordHash: hash, firstName: 'Admin', lastName: 'A' } })).id;
    await owner.user.create({ data: { schoolId: b, roleId: adminRole, email: `${tag}.b@example.test`, passwordHash: hash, firstName: 'Admin', lastName: 'B' } });
    await owner.schoolClass.create({ data: { schoolId: a, name: 'Class 1' } });
    await owner.academicSession.create({ data: { schoolId: a, name: '2026-2027', startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'), isCurrent: true } });
  });

  afterAll(async () => {
    for (const id of [a, b]) {
      await owner.auditLog.deleteMany({ where: { schoolId: id } });
      await owner.user.deleteMany({ where: { schoolId: id } });
      await owner.school.deleteMany({ where: { id } });
    }
    await owner.$disconnect();
    await runtime.$disconnect();
  });

  it('overview shows only this school, with real counts', async () => {
    const o = await svc.overview(a);
    expect(o.school.id).toBe(a);
    expect(o.counts).toMatchObject({ users: 1, activeUsers: 1, classes: 1, sections: 0, subjects: 0 });
    expect(o.currentSession?.name).toBe('2026-2027');
    expect(o.usersByRole).toEqual([{ roleKey: 'school_admin', roleName: 'School Administrator', count: 1 }]);
  });

  it('users of another school are invisible and untouchable', async () => {
    const users = await svc.listUsers(a, {});
    expect(users.map((u) => u.email)).toEqual([`${tag}.a@example.test`]);
    const other = await owner.user.findFirstOrThrow({ where: { schoolId: b } });
    await expect(svc.updateUser(a, other.id, { firstName: 'Hacked' }, adminA)).rejects.toMatchObject({ status: 404 });
    await expect(svc.setUserStatus(a, other.id, 'INACTIVE', adminA)).rejects.toMatchObject({ status: 404 });
    expect((await owner.user.findUniqueOrThrow({ where: { id: other.id } })).firstName).toBe('Admin');
  });

  it('creates a user, rejects duplicates (also across schools), and refuses the super_admin role', async () => {
    const input = { firstName: 'Tina', lastName: 'Teacher', email: `${tag}.t@example.test`, roleId: teacherRole, password: 'Correct-Horse-9' };
    const u = await svc.createUser(a, input, adminA);
    newUser = u.id;
    expect(u.role.key).toBe('teacher');
    await expect(svc.createUser(a, input, adminA)).rejects.toMatchObject({ status: 409 });
    await expect(svc.createUser(a, { ...input, email: `${tag}.b@example.test` }, adminA)).rejects.toBeDefined(); // email used in school B (unique index)
    const superRole = await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'super_admin' } });
    await expect(svc.createUser(a, { ...input, email: `${tag}.x@example.test`, roleId: superRole.id }, adminA)).rejects.toMatchObject({ status: 400 });
  });

  it('changes role and status, ends sessions, and protects the last school admin and yourself', async () => {
    await owner.refreshToken.create({ data: { userId: newUser, tokenHash: `${tag}-h`, familyId: newUser, expiresAt: new Date(Date.now() + 3_600_000) } });
    expect((await svc.updateUser(a, newUser, { roleId: adminRole }, adminA)).role.key).toBe('school_admin');
    expect((await owner.refreshToken.findUniqueOrThrow({ where: { tokenHash: `${tag}-h` } })).revokedAt).not.toBeNull();
    expect((await svc.setUserStatus(a, newUser, 'INACTIVE', adminA)).status).toBe('INACTIVE');
    await expect(svc.setUserStatus(a, adminA, 'INACTIVE', adminA)).rejects.toMatchObject({ status: 400 }); // self
    await svc.setUserStatus(a, newUser, 'ACTIVE', adminA);
    await expect(svc.updateUser(a, newUser, { roleId: teacherRole }, adminA)).resolves.toBeDefined(); // another admin (adminA) remains
    await svc.updateUser(a, newUser, { roleId: adminRole }, adminA);
    await svc.setUserStatus(a, newUser, 'INACTIVE', adminA);
    const lone = await owner.user.create({ data: { schoolId: a, roleId: teacherRole, email: `${tag}.l@example.test`, passwordHash: 'x', firstName: 'L', lastName: 'L' } });
    await expect(svc.setUserStatus(a, adminA, 'INACTIVE', lone.id)).rejects.toMatchObject({ status: 400 }); // last active school admin
  });

  it('profile update and audit log stay inside the school', async () => {
    expect((await svc.updateProfile(a, { city: 'Multan' }, adminA)).city).toBe('Multan');
    expect((await owner.school.findUniqueOrThrow({ where: { id: b } })).city).toBeNull();
    const logs = await svc.listAuditLogs(a, { action: 'school.', limit: 50 });
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['school.profile.update', 'school.user.create', 'school.user.update', 'school.user.deactivate']));
    expect(await svc.listAuditLogs(b, { limit: 50 })).toEqual([]);
  });
});
