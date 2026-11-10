/**
 * Real database test of the Super Admin service (schools, plans, subscriptions, audit, platform admins).
 * Needs migrations + `pnpm db:rls` + `pnpm db:seed`. Run:  set RUN_DB_TESTS=1   then   pnpm --filter @nexora/api test
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PlatformService } from '../src/modules/platform/platform.service';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('platform service (PostgreSQL)', () => {
  let owner: PrismaClient;
  let runtime: PrismaClient;
  let svc: PlatformService;
  const tag = `plat-${Date.now()}`;
  let actor = '';
  let planId = '';
  let schoolId = '';

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    svc = new PlatformService(runtime);
    const sa = await owner.user.findFirst({ where: { schoolId: null, role: { key: 'super_admin' } } });
    if (!sa) throw new Error('Run pnpm db:seed first');
    actor = sa.id;
  });

  afterAll(async () => {
    if (schoolId) {
      await owner.auditLog.deleteMany({ where: { schoolId } });
      await owner.user.deleteMany({ where: { schoolId } });
      await owner.school.deleteMany({ where: { id: schoolId } });
    }
    await owner.auditLog.deleteMany({ where: { action: { startsWith: 'platform.' }, metadata: { path: ['name'], string_contains: tag } } });
    await owner.subscriptionPlan.deleteMany({ where: { name: { startsWith: tag } } });
    await owner.user.deleteMany({ where: { email: { startsWith: tag } } });
    await owner.$disconnect();
    await runtime.$disconnect();
  });

  it('creates a plan and rejects a duplicate name', async () => {
    const plan = await svc.createPlan({ name: `${tag}-pro`, priceMonthly: 4999.5, maxStudents: 500, isActive: true }, actor);
    planId = plan.id;
    expect(plan.priceMonthly).toBe(4999.5);
    await expect(svc.createPlan({ name: `${tag}-pro`, priceMonthly: 1, isActive: true }, actor)).rejects.toMatchObject({ status: 409 });
    expect((await svc.updatePlan(planId, { priceMonthly: 5500 }, actor)).priceMonthly).toBe(5500);
  });

  it('creates a school with a trial subscription and its first school admin', async () => {
    const input = {
      name: `${tag} School`, code: tag, timezone: 'Asia/Karachi', planId,
      admin: { firstName: 'First', lastName: 'Admin', email: `${tag}.admin@example.test`, password: 'Correct-Horse-9' },
    };
    const school = await svc.createSchool(input, actor);
    schoolId = school.id;
    expect(school.subscription?.status).toBe('TRIAL');
    expect(school.subscription?.planId).toBe(planId);
    expect(school.admins.map((a) => a.email)).toEqual([input.admin.email]);
    await expect(svc.createSchool(input, actor)).rejects.toMatchObject({ status: 409 });
    await expect(svc.createSchool({ ...input, code: `${tag}-2` }, actor)).rejects.toMatchObject({ status: 409 }); // same admin email
    expect((await svc.listSchools({ q: tag })).map((s) => s.id)).toContain(schoolId);
  });

  it('suspends a school, revokes its sessions, and reactivates', async () => {
    const admin = await owner.user.findUniqueOrThrow({ where: { email: `${tag}.admin@example.test` } });
    await owner.refreshToken.create({ data: { userId: admin.id, tokenHash: `${tag}-h`, familyId: admin.id, expiresAt: new Date(Date.now() + 3_600_000) } });
    expect((await svc.setSchoolStatus(schoolId, 'SUSPENDED', actor)).status).toBe('SUSPENDED');
    expect((await owner.refreshToken.findUniqueOrThrow({ where: { tokenHash: `${tag}-h` } })).revokedAt).not.toBeNull();
    expect((await svc.setSchoolStatus(schoolId, 'ACTIVE', actor)).status).toBe('ACTIVE');
  });

  it('changes the subscription keeping history, and writes audit rows', async () => {
    const school = await svc.setSubscription(schoolId, { planId, status: 'ACTIVE', endsAt: '2030-01-31' }, actor);
    expect(school.subscription?.status).toBe('ACTIVE');
    expect(school.subscriptions.length).toBe(2);
    const logs = await svc.listAuditLogs({ schoolId, limit: 50 });
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['platform.school.create', 'platform.school.suspend', 'platform.school.activate', 'platform.school.subscription']));
  });

  it('reports analytics and protects the last platform admin', async () => {
    const a = await svc.analytics();
    expect(a.schools.total).toBeGreaterThanOrEqual(1);
    expect(a.newSchoolsByMonth).toHaveLength(6);
    await expect(svc.setPlatformAdminStatus(actor, 'INACTIVE', actor)).rejects.toMatchObject({ status: 400 });
    const second = await svc.createPlatformAdmin({ firstName: 'Second', lastName: 'Admin', email: `${tag}.sa@example.test`, password: 'Correct-Horse-9' }, actor);
    expect((await svc.setPlatformAdminStatus(second.id, 'INACTIVE', actor)).status).toBe('INACTIVE');
  });
});
