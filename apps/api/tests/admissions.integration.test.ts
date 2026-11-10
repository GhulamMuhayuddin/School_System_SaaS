/**
 * Real database test of admissions (approve => student) and the parent portal.
 * Needs the Phase 5 migrations (5A + 5B), `pnpm db:rls`, `pnpm db:seed`. Run:  set RUN_DB_TESTS=1  then  pnpm --filter @nexora/api test
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AdmissionsService } from '../src/modules/admissions/admissions.service';
import { PortalService } from '../src/modules/portal/portal.service';
import { SchoolService } from '../src/modules/school/school.service';
import { StudentsService } from '../src/modules/students/students.service';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('admissions and parent portal (PostgreSQL)', () => {
  let owner: PrismaClient;
  let runtime: PrismaClient;
  let admissions: AdmissionsService;
  let students: StudentsService;
  let school: SchoolService;
  let portal: PortalService;
  const tag = `adm-${Date.now()}`;
  let a = '';
  let b = '';
  let actor = '';
  let classA = '';
  let classB = '';
  let appId = '';
  let guardianId = '';

  const input = () => ({
    firstName: 'Ali', lastName: 'Khan', gender: 'MALE' as const, dateOfBirth: '2018-03-01', appliedClassId: classA,
    guardianName: 'Ahmed Khan', guardianPhone: '0300-1234567', guardianRelation: 'FATHER' as const, applicationDate: '2026-03-01',
  });

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    students = new StudentsService(runtime);
    admissions = new AdmissionsService(runtime, students);
    school = new SchoolService(runtime);
    portal = new PortalService(runtime, {} as never);
    const role = await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'school_admin' } });
    a = (await owner.school.create({ data: { name: `${tag} A`, code: `${tag}-a` } })).id;
    b = (await owner.school.create({ data: { name: `${tag} B`, code: `${tag}-b` } })).id;
    actor = (await owner.user.create({ data: { schoolId: a, roleId: role.id, email: `${tag}@example.test`, passwordHash: 'x', firstName: 'A', lastName: 'A' } })).id;
    classA = (await owner.schoolClass.create({ data: { schoolId: a, name: 'Class 1' } })).id;
    classB = (await owner.schoolClass.create({ data: { schoolId: b, name: 'Class 1' } })).id;
  });

  afterAll(async () => {
    for (const id of [a, b]) {
      await owner.auditLog.deleteMany({ where: { schoolId: id } });
      await owner.admissionApplication.deleteMany({ where: { schoolId: id } });
      await owner.studentGuardian.deleteMany({ where: { schoolId: id } });
      await owner.student.deleteMany({ where: { schoolId: id } });
      await owner.guardian.deleteMany({ where: { schoolId: id } });
      await owner.schoolCounter.deleteMany({ where: { schoolId: id } });
      await owner.user.deleteMany({ where: { schoolId: id } });
      await owner.schoolClass.deleteMany({ where: { schoolId: id } });
      await owner.school.deleteMany({ where: { id } });
    }
    await owner.$disconnect();
    await runtime.$disconnect();
  });

  it('numbers applications per school and rejects a class of another school', async () => {
    const first = await admissions.create(a, input(), actor);
    appId = first.id;
    expect(first.applicationNo).toBe('APP-0001');
    expect(first.status).toBe('PENDING');
    expect((await admissions.create(a, { ...input(), firstName: 'Sara' }, actor)).applicationNo).toBe('APP-0002');
    await expect(admissions.create(a, { ...input(), appliedClassId: classB }, actor)).rejects.toMatchObject({ status: 400 });
    expect((await admissions.list(a, { limit: 50 })).total).toBe(2);
    expect((await admissions.list(b, { limit: 50 })).total).toBe(0);
    await expect(admissions.get(b, appId)).rejects.toMatchObject({ status: 404 });
  });

  it('approving creates the student and guardian together and cannot be repeated', async () => {
    await expect(admissions.approve(b, appId, { admissionDate: '2026-04-01' }, actor)).rejects.toMatchObject({ status: 404 });
    const { application, student } = await admissions.approve(a, appId, { admissionDate: '2026-04-01' }, actor);
    expect(application.status).toBe('APPROVED');
    expect(application.student?.id).toBe(student.id);
    expect(application.decidedBy?.id).toBe(actor);
    expect(student.admissionNo).toBe('0001');
    expect(student.class.id).toBe(classA);
    expect(student.guardians).toHaveLength(1);
    expect(student.guardians[0].name).toBe('Ahmed Khan');
    guardianId = student.guardians[0].guardianId;
    await expect(admissions.approve(a, appId, { admissionDate: '2026-04-01' }, actor)).rejects.toMatchObject({ status: 409 });
    await expect(admissions.reject(a, appId, null, actor)).rejects.toMatchObject({ status: 409 });
    await expect(admissions.update(a, appId, { firstName: 'Late' }, actor)).rejects.toMatchObject({ status: 409 });
  });

  it('a failed approval leaves nothing behind (all or nothing)', async () => {
    const second = (await admissions.list(a, { status: 'PENDING', limit: 10 })).applications[0];
    const before = await owner.student.count({ where: { schoolId: a } });
    await expect(admissions.approve(a, second.id, { admissionDate: '2026-04-01', admissionNo: '0001' }, actor)).rejects.toMatchObject({ status: 409 }); // number already used
    expect(await owner.student.count({ where: { schoolId: a } })).toBe(before);
    expect((await admissions.get(a, second.id)).status).toBe('PENDING');
    const rejected = await admissions.reject(a, second.id, 'No seats', actor);
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.decisionNote).toBe('No seats');
  });

  it('gives a guardian a parent login that sees only their own children', async () => {
    await expect(school.createGuardianAccount(b, guardianId, { email: `${tag}.p@example.test`, password: 'Correct-Horse-9' }, actor)).rejects.toMatchObject({ status: 404 });
    const user = await school.createGuardianAccount(a, guardianId, { email: `${tag}.p@example.test`, password: 'Correct-Horse-9' }, actor);
    expect(user.role.key).toBe('parent');
    await expect(school.createGuardianAccount(a, guardianId, { email: `${tag}.q@example.test`, password: 'Correct-Horse-9' }, actor)).rejects.toMatchObject({ status: 409 });
    const mine = await portal.children(a, user.id);
    expect(mine.guardianName).toBe('Ahmed Khan');
    expect(mine.children.map((c) => c.admissionNo)).toEqual(['0001']);
    expect(await portal.children(a, actor)).toEqual({ viewer: 'PARENT', guardianName: null, children: [] }); // an administrator is not a parent
    expect(await portal.children(b, user.id)).toEqual({ viewer: 'PARENT', guardianName: null, children: [] }); // wrong school context sees nothing
  });
});
