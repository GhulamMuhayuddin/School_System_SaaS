/**
 * Real database test of classes/sections, students and guardians (needs the Phase 5 migration, `pnpm db:rls`, `pnpm db:seed`).
 * Run:  set RUN_DB_TESTS=1   then   pnpm --filter @nexora/api test
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AcademicsService } from '../src/modules/academics/academics.service';
import { StudentsService } from '../src/modules/students/students.service';
import { tenantTransaction } from '../src/db/tenant';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('students, guardians and classes (PostgreSQL)', () => {
  let owner: PrismaClient;
  let runtime: PrismaClient;
  let students: StudentsService;
  let academics: AcademicsService;
  const tag = `stu-${Date.now()}`;
  let a = '';
  let b = '';
  let actor = '';
  let classA = '';
  let sectionA = '';
  let classB = '';
  let first = '';
  let second = '';

  const guardian = { name: 'Ahmed Khan', phone: '0300-1234567', relation: 'FATHER' as const };
  const base = () => ({ firstName: 'Ali', lastName: 'Khan', gender: 'MALE' as const, dateOfBirth: '2015-05-20', classId: classA, admissionDate: '2026-04-01', guardians: [guardian] });

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    students = new StudentsService(runtime);
    academics = new AcademicsService(runtime);
    const role = await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'school_admin' } });
    a = (await owner.school.create({ data: { name: `${tag} A`, code: `${tag}-a` } })).id;
    b = (await owner.school.create({ data: { name: `${tag} B`, code: `${tag}-b` } })).id;
    actor = (await owner.user.create({ data: { schoolId: a, roleId: role.id, email: `${tag}@example.test`, passwordHash: 'x', firstName: 'A', lastName: 'A' } })).id;
    classB = (await owner.schoolClass.create({ data: { schoolId: b, name: 'Class 1' } })).id;
  });

  afterAll(async () => {
    for (const id of [a, b]) {
      await owner.auditLog.deleteMany({ where: { schoolId: id } });
      await owner.studentGuardian.deleteMany({ where: { schoolId: id } });
      await owner.student.deleteMany({ where: { schoolId: id } });
      await owner.guardian.deleteMany({ where: { schoolId: id } });
      await owner.schoolCounter.deleteMany({ where: { schoolId: id } });
      await owner.user.deleteMany({ where: { schoolId: id } });
      await owner.school.deleteMany({ where: { id } });
    }
    await owner.$disconnect();
    await runtime.$disconnect();
  });

  it('manages classes and sections, and refuses duplicates', async () => {
    const c = await academics.createClass(a, { name: 'Class 1', level: 1 }, actor);
    classA = c.id;
    await expect(academics.createClass(a, { name: 'Class 1', level: 1 }, actor)).rejects.toMatchObject({ status: 409 });
    const withSection = await academics.createSection(a, classA, { name: 'A', capacity: 30 }, actor);
    sectionA = withSection.sections[0].id;
    await expect(academics.createSection(a, classA, { name: 'A' }, actor)).rejects.toMatchObject({ status: 409 });
    await expect(academics.createSection(a, classB, { name: 'A' }, actor)).rejects.toMatchObject({ status: 404 }); // class of another school
  });

  it('enrols a student with automatic admission numbers and a shared guardian for siblings', async () => {
    const s1 = await students.create(a, { ...base(), sectionId: sectionA }, actor);
    first = s1.id;
    expect(s1.admissionNo).toBe('0001');
    expect(s1.guardians).toHaveLength(1);
    expect(s1.guardians[0].isPrimary).toBe(true);
    const s2 = await students.create(a, { ...base(), firstName: 'Sara' }, actor);
    second = s2.id;
    expect(s2.admissionNo).toBe('0002');
    expect(s2.guardians[0].guardianId).toBe(s1.guardians[0].guardianId); // same phone + name = same guardian
    expect((await students.get(a, first)).siblings.map((x) => x.id)).toEqual([second]);
    expect(await owner.guardian.count({ where: { schoolId: a } })).toBe(1);
  });

  it('rejects duplicate admission numbers, foreign classes and sections of another class', async () => {
    await expect(students.create(a, { ...base(), admissionNo: '0001' }, actor)).rejects.toMatchObject({ status: 409 });
    await expect(students.create(a, { ...base(), classId: classB }, actor)).rejects.toMatchObject({ status: 400 });
    const other = await academics.createClass(a, { name: 'Class 2', level: 2 }, actor);
    await expect(students.create(a, { ...base(), classId: other.id, sectionId: sectionA }, actor)).rejects.toMatchObject({ status: 400 });
  });

  it('keeps a manually typed admission number from colliding with the generated one', async () => {
    await students.create(a, { ...base(), firstName: 'Manual', admissionNo: '0003' }, actor);
    expect((await students.create(a, { ...base(), firstName: 'Auto' }, actor)).admissionNo).toBe('0004');
  });

  it('hides students of other schools completely', async () => {
    const s = await students.create(b, { ...base(), classId: classB }, actor);
    expect((await students.list(a, { limit: 100 })).students.map((x) => x.id)).not.toContain(s.id);
    await expect(students.get(a, s.id)).rejects.toMatchObject({ status: 404 });
    await expect(students.update(a, s.id, { firstName: 'Hacked' }, actor)).rejects.toMatchObject({ status: 404 });
    await expect(students.withdraw(a, s.id, { status: 'WITHDRAWN', date: '2026-10-01' }, actor)).rejects.toMatchObject({ status: 404 });
    expect((await owner.student.findUniqueOrThrow({ where: { id: s.id } })).firstName).toBe('Ali');
    // Row Level Security alone (no explicit schoolId in the query) must also hide it.
    const seen = await tenantTransaction(runtime, a, (tx) => tx.student.findMany({ where: { id: s.id } }));
    expect(seen).toHaveLength(0);
  });

  it('moves a student to another class (clearing the section), withdraws and reinstates', async () => {
    const other = await academics.listClasses(a);
    const class2 = other.find((c) => c.name === 'Class 2')!;
    const moved = await students.update(a, first, { classId: class2.id }, actor);
    expect(moved.class.id).toBe(class2.id);
    expect(moved.section).toBeNull();
    const w = await students.withdraw(a, first, { status: 'TRANSFERRED', date: '2026-10-01', reason: 'Moved city' }, actor);
    expect(w.status).toBe('TRANSFERRED');
    await expect(students.withdraw(a, first, { status: 'WITHDRAWN', date: '2026-10-02' }, actor)).rejects.toMatchObject({ status: 409 });
    expect((await students.reinstate(a, first, actor)).status).toBe('ACTIVE');
  });

  it('manages guardians: add, primary switch, protects the last guardian', async () => {
    const withTwo = await students.addGuardian(a, second, { name: 'Fatima Khan', phone: '0301-7654321', relation: 'MOTHER', isPrimary: true }, actor);
    expect(withTwo.guardians.filter((g) => g.isPrimary).map((g) => g.name)).toEqual(['Fatima Khan']);
    await expect(students.addGuardian(a, second, { name: 'Fatima Khan', phone: '0301-7654321', relation: 'MOTHER' }, actor)).rejects.toMatchObject({ status: 409 });
    const mother = withTwo.guardians.find((g) => g.name === 'Fatima Khan')!;
    const after = await students.removeGuardian(a, second, mother.linkId, actor);
    expect(after.guardians).toHaveLength(1);
    expect(after.guardians[0].isPrimary).toBe(true); // primary moved to the remaining guardian
    await expect(students.removeGuardian(a, second, after.guardians[0].linkId, actor)).rejects.toMatchObject({ status: 400 });
  });

  it('soft-deletes, refuses to delete classes/sections that have students, and writes audit rows', async () => {
    await students.remove(a, second, actor);
    await expect(students.get(a, second)).rejects.toMatchObject({ status: 404 });
    await expect(academics.deleteClass(a, classA, actor)).rejects.toMatchObject({ status: 409 });
    await expect(academics.deleteSection(a, sectionA, actor)).resolves.toBeUndefined(); // the first student left that section when moved, so it is empty and can be deleted
    const logs = await owner.auditLog.findMany({ where: { schoolId: a, action: { startsWith: 'student.' } } });
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['student.create', 'student.update', 'student.transferred', 'student.reinstate', 'student.delete', 'student.guardian.add']));
  });
});
