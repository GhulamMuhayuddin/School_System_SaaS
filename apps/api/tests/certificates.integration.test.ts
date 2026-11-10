/**
 * Real database test of Phase 17A certificates. Needs the migration with `certificates`, `pnpm db:rls`.
 * Run:  set RUN_DB_TESTS=1  then  pnpm --filter @nexora/api test
 * Setup (today = 2026-11-04): Ali studies in Class 5 / A (father Mr Raza). Sana withdrew on 2026-10-15 from Class 6.
 * Rules: bonafide only for Ali (active); leaving only for Sana (left), not dated before 15 Oct, one valid at a time; character for both.
 * The certificate keeps a COPY of the details, so renaming the student later does not change an issued certificate.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CertificatesService } from '../src/modules/certificates/certificates.service';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('certificates (PostgreSQL)', () => {
  let owner: PrismaClient; let runtime: PrismaClient; let svc: CertificatesService;
  const tag = `crt-${Date.now()}`;
  let a = ''; let b = ''; let actor = ''; let ali = ''; let sana = '';
  let bonafide = ''; let leaving = '';
  const day = (s: string) => new Date(`${s}T00:00:00Z`);

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    svc = new CertificatesService(runtime, () => new Date('2026-11-04T09:00:00Z'));
    a = (await owner.school.create({ data: { name: `${tag} A School`, code: `${tag}-a`, address: 'Main Road', city: 'Lahore', phone: '042-1234567' } })).id;
    b = (await owner.school.create({ data: { name: `${tag} B`, code: `${tag}-b` } })).id;
    const role = (await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'principal' } })).id;
    actor = (await owner.user.create({ data: { schoolId: a, roleId: role, email: `${tag}@example.test`, passwordHash: 'x', firstName: 'Pri', lastName: 'Ncipal' } })).id;
    const c5 = (await owner.schoolClass.create({ data: { schoolId: a, name: 'Class 5', level: 5 } } as never)).id;
    const c6 = (await owner.schoolClass.create({ data: { schoolId: a, name: 'Class 6', level: 6 } } as never)).id;
    const secA = (await owner.section.create({ data: { schoolId: a, classId: c5, name: 'A' } } as never)).id;
    const stu = (no: string, first: string, classId: string, gender: string, extra: object = {}) => owner.student.create({ data: { schoolId: a, admissionNo: `${tag}-${no}`, firstName: first, lastName: 'Khan', gender, dateOfBirth: day('2015-03-02'), classId, admissionDate: day('2022-04-01'), ...extra } } as never);
    ali = (await stu('1', 'Ali', c5, 'MALE', { sectionId: secA })).id;
    sana = (await stu('2', 'Sana', c6, 'FEMALE', { status: 'WITHDRAWN', leftAt: day('2026-10-15'), leftReason: 'Moved city' })).id;
    const father = await owner.guardian.create({ data: { schoolId: a, name: 'Mr Raza', phone: '0300-1111111' } } as never);
    await owner.studentGuardian.create({ data: { schoolId: a, studentId: ali, guardianId: father.id, relation: 'FATHER', isPrimary: true } } as never);
  });
  afterAll(async () => {
    await owner.school.deleteMany({ where: { id: { in: [a, b] } } }).catch(() => {});
    await owner.$disconnect(); await runtime.$disconnect();
  });

  it('issues a bonafide certificate with a copy of the details and the school header', async () => {
    const d = await svc.issue(a, actor, { studentId: ali, type: 'BONAFIDE', purpose: ' Passport application ' });
    bonafide = d.certificate.id;
    expect(d.certificate).toMatchObject({
      certNo: 'CERT-000001', type: 'BONAFIDE', studentName: 'Ali Khan', gender: 'MALE', fatherName: 'Mr Raza', className: 'Class 5', sectionName: 'A', dateOfBirth: '2015-03-02',
      admissionDate: '2022-04-01', leftAt: null, issuedOn: '2026-11-04', purpose: 'Passport application', status: 'VALID', issuedBy: 'Pri Ncipal',
    });
    expect(d.school).toMatchObject({ name: `${tag} A School`, address: 'Main Road', city: 'Lahore', phone: '042-1234567' });
  });

  it('applies the eligibility rules', async () => {
    await expect(svc.issue(a, actor, { studentId: sana, type: 'BONAFIDE' })).rejects.toMatchObject({ status: 409 }); // not studying here now
    await expect(svc.issue(a, actor, { studentId: ali, type: 'LEAVING' })).rejects.toMatchObject({ status: 409 });   // still active
    await expect(svc.issue(a, actor, { studentId: sana, type: 'LEAVING', issuedOn: '2026-10-10' })).rejects.toMatchObject({ status: 400 }); // before she left
    await expect(svc.issue(a, actor, { studentId: ali, type: 'CHARACTER', issuedOn: '2026-11-05' })).rejects.toMatchObject({ status: 400 }); // future
    await expect(svc.issue(a, actor, { studentId: '00000000-0000-4000-8000-000000000000', type: 'CHARACTER' })).rejects.toMatchObject({ status: 404 });
    await expect(svc.issue(b, actor, { studentId: ali, type: 'CHARACTER' })).rejects.toMatchObject({ status: 404 }); // another school's student
  });

  it('issues a leaving certificate once; a void frees the way for a corrected one', async () => {
    const d = await svc.issue(a, actor, { studentId: sana, type: 'LEAVING', purpose: 'Family moved to another city', remarks: 'Good conduct' });
    leaving = d.certificate.id;
    expect(d.certificate).toMatchObject({ certNo: 'CERT-000002', studentName: 'Sana Khan', gender: 'FEMALE', fatherName: null, className: 'Class 6', leftAt: '2026-10-15' });
    await expect(svc.issue(a, actor, { studentId: sana, type: 'LEAVING' })).rejects.toMatchObject({ status: 409 });
    const v = await svc.void(a, actor, leaving, 'Wrong reason printed');
    expect(v.certificate).toMatchObject({ status: 'VOID', voidReason: 'Wrong reason printed' });
    await expect(svc.void(a, actor, leaving, 'Again')).rejects.toMatchObject({ status: 409 });
    const again = await svc.issue(a, actor, { studentId: sana, type: 'LEAVING', purpose: 'Moved to another city' });
    expect(again.certificate.certNo).toBe('CERT-000003'); // numbers are never reused
  });

  it('character certificates can be issued again and again', async () => {
    const one = await svc.issue(a, actor, { studentId: sana, type: 'CHARACTER', remarks: 'Her conduct was excellent' });
    const two = await svc.issue(a, actor, { studentId: sana, type: 'CHARACTER', remarks: 'Her conduct was excellent' });
    expect(one.certificate.certNo).toBe('CERT-000004');
    expect(two.certificate.certNo).toBe('CERT-000005');
  });

  it('a certificate is a copy: renaming the student later changes nothing', async () => {
    await owner.student.update({ where: { id: ali }, data: { firstName: 'Aly', lastName: 'Raza' } });
    const d = await svc.get(a, bonafide);
    expect(d.certificate.studentName).toBe('Ali Khan');
    expect(d.certificate.className).toBe('Class 5');
  });

  it('lists with filters and keeps schools apart', async () => {
    expect((await svc.list(a, {})).certificates).toHaveLength(5);
    expect((await svc.list(a, { type: 'LEAVING' })).certificates.map((c) => c.status).sort()).toEqual(['VALID', 'VOID']);
    expect((await svc.list(a, { status: 'VOID' })).certificates.map((c) => c.certNo)).toEqual(['CERT-000002']);
    expect((await svc.list(a, { studentId: ali })).certificates.map((c) => c.certNo)).toEqual(['CERT-000001']);
    expect((await svc.list(a, { q: 'sana' })).certificates).toHaveLength(4);
    expect((await svc.list(a, { q: 'cert-000004' })).certificates).toHaveLength(1);
    expect((await svc.list(b, {})).certificates).toEqual([]);
    await expect(svc.get(b, bonafide)).rejects.toMatchObject({ status: 404 });
    await expect(svc.void(b, actor, bonafide, 'Not mine')).rejects.toMatchObject({ status: 404 });
  });
});
