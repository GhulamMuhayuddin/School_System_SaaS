/**
 * Real database test of staff (numbering, isolation, login creation, leaving closes the login).
 * Needs the Phase 6 migration, `pnpm db:rls`, `pnpm db:seed`. Run:  set RUN_DB_TESTS=1  then  pnpm --filter @nexora/api test
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SchoolService } from '../src/modules/school/school.service';
import { StaffService } from '../src/modules/staff/staff.service';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('staff (PostgreSQL)', () => {
  let owner: PrismaClient;
  let runtime: PrismaClient;
  let staff: StaffService;
  let school: SchoolService;
  const tag = `stf-${Date.now()}`;
  let a = '';
  let b = '';
  let actor = '';
  let teacherRole = '';
  const input = (over: object = {}) => ({
    firstName: 'Sana', lastName: 'Iqbal', gender: 'FEMALE' as const, phone: '0300-1234567', category: 'TEACHING' as const,
    designation: 'Maths Teacher', joiningDate: '2026-04-01', ...over,
  });

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    staff = new StaffService(runtime);
    school = new SchoolService(runtime);
    const admin = await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'school_admin' } });
    teacherRole = (await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'teacher' } })).id;
    a = (await owner.school.create({ data: { name: `${tag} A`, code: `${tag}-a` } })).id;
    b = (await owner.school.create({ data: { name: `${tag} B`, code: `${tag}-b` } })).id;
    actor = (await owner.user.create({ data: { schoolId: a, roleId: admin.id, email: `${tag}@example.test`, passwordHash: 'x', firstName: 'A', lastName: 'A' } })).id;
  });

  afterAll(async () => {
    for (const id of [a, b]) {
      await owner.auditLog.deleteMany({ where: { schoolId: id } });
      await owner.staff.deleteMany({ where: { schoolId: id } });
      await owner.schoolCounter.deleteMany({ where: { schoolId: id } });
      await owner.refreshToken.deleteMany({ where: { user: { schoolId: id } } });
      await owner.user.deleteMany({ where: { schoolId: id } });
      await owner.school.deleteMany({ where: { id } });
    }
    await owner.$disconnect();
    await runtime.$disconnect();
  });

  let first = '';
  it('numbers employees per school and skips numbers typed by hand', async () => {
    const s1 = await staff.create(a, input(), actor);
    first = s1.id;
    expect(s1.employeeNo).toBe('E-001');
    await staff.create(a, input({ employeeNo: 'E-002', firstName: 'Manual' }), actor);
    expect((await staff.create(a, input({ firstName: 'Third' }), actor)).employeeNo).toBe('E-003');
    expect((await staff.create(b, input(), actor)).employeeNo).toBe('E-001');
    await expect(staff.create(a, input({ employeeNo: 'E-001' }), actor)).rejects.toMatchObject({ status: 409 });
  });

  it('never shows another school\'s staff, even by id', async () => {
    expect((await staff.list(a, { limit: 100 })).staff.every((s) => s.employeeNo.startsWith('E-'))).toBe(true);
    expect((await staff.list(b, { limit: 100 })).total).toBe(1);
    await expect(staff.get(b, first)).rejects.toMatchObject({ status: 404 });
    const rows = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.school_id', ${b}, true)`;
      return tx.staff.findMany({ where: { id: first } });
    });
    expect(rows).toHaveLength(0);
  });

  it('creates one login per staff member and refuses parent roles, duplicates and reused emails', async () => {
    const acc = { email: `${tag}-sana@example.test`, password: 'a-long-password-1', roleId: teacherRole };
    const u = await school.createStaffAccount(a, first, acc, actor);
    expect(u.role.key).toBe('teacher');
    expect((await staff.get(a, first)).account?.email).toBe(acc.email);
    await expect(school.createStaffAccount(a, first, { ...acc, email: `${tag}-2@example.test` }, actor)).rejects.toMatchObject({ status: 409 });
    const parent = await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'parent' } });
    const other = (await staff.list(a, { q: 'Manual', limit: 5 })).staff[0];
    await expect(school.createStaffAccount(a, other.id, { ...acc, email: `${tag}-3@example.test`, roleId: parent.id }, actor)).rejects.toMatchObject({ status: 400 });
    await expect(school.createStaffAccount(a, other.id, acc, actor)).rejects.toMatchObject({ status: 409 });
  });

  it('closing a staff member closes the login and ends sessions; reinstating does not reopen it', async () => {
    const userId = (await staff.get(a, first)).account!.id;
    await owner.refreshToken.create({ data: { userId, tokenHash: `${tag}-h`, familyId: randomUUID(), expiresAt: new Date(Date.now() + 3600_000) } });
    await expect(staff.remove(a, first, actor)).rejects.toMatchObject({ status: 409 });
    const left = await staff.leave(a, first, { date: '2026-10-01', reason: 'Resigned' }, actor);
    expect(left.status).toBe('LEFT');
    expect((await owner.user.findUniqueOrThrow({ where: { id: userId } })).status).toBe('INACTIVE');
    expect(await owner.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(0);
    await expect(staff.leave(a, first, { date: '2026-10-02' }, actor)).rejects.toMatchObject({ status: 409 });
    expect((await staff.reinstate(a, first, actor)).status).toBe('ACTIVE');
    expect((await owner.user.findUniqueOrThrow({ where: { id: userId } })).status).toBe('INACTIVE');
  });

  it('soft-deletes', async () => {
    const s = await staff.create(a, input({ firstName: 'Temp' }), actor);
    await staff.remove(a, s.id, actor);
    await expect(staff.get(a, s.id)).rejects.toMatchObject({ status: 404 });
    expect(await owner.staff.count({ where: { id: s.id } })).toBe(1);
  });
});
