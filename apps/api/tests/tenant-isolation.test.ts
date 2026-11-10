/**
 * Real database test of tenant isolation. Needs Postgres with migrations + `pnpm db:rls` applied.
 * Run:  RUN_DB_TESTS=1 pnpm --filter @nexora/api test
 * (PowerShell: $env:RUN_DB_TESTS=1; pnpm --filter @nexora/api test)
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forSchool, tenantTransaction } from '../src/db/tenant';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('tenant isolation (PostgreSQL RLS)', () => {
  // Created inside beforeAll: describe.skipIf still runs this body, so clients must not be built here.
  let owner: PrismaClient;
  let app: PrismaClient;
  const tag = `iso-${Date.now()}`;
  let schoolA = '';
  let schoolB = '';
  let sessionA = '';
  let sessionB = '';

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    app = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    const a = await owner.school.create({ data: { name: 'Iso A', code: `${tag}-a` } });
    const b = await owner.school.create({ data: { name: 'Iso B', code: `${tag}-b` } });
    schoolA = a.id;
    schoolB = b.id;
    const range = { startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31') };
    sessionA = (await owner.academicSession.create({ data: { schoolId: schoolA, name: 'A-2026', ...range } })).id;
    sessionB = (await owner.academicSession.create({ data: { schoolId: schoolB, name: 'B-2026', ...range } })).id;
  });

  afterAll(async () => {
    if (!owner || !app) return;
    await owner.academicSession.deleteMany({ where: { schoolId: { in: [schoolA, schoolB] } } });
    await owner.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } });
    await owner.$disconnect();
    await app.$disconnect();
  });

  it('a school only lists its own rows', async () => {
    const rows = await forSchool(app, schoolA).academicSession.findMany();
    expect(rows.map((r) => r.id)).toContain(sessionA);
    expect(rows.map((r) => r.id)).not.toContain(sessionB);
  });

  it('a school cannot read another school row even by its id', async () => {
    expect(await forSchool(app, schoolA).academicSession.findUnique({ where: { id: sessionB } })).toBeNull();
  });

  it('a school cannot update or delete another school rows', async () => {
    const client = forSchool(app, schoolA);
    expect((await client.academicSession.updateMany({ where: { id: sessionB }, data: { name: 'hacked' } })).count).toBe(0);
    expect((await client.academicSession.deleteMany({ where: { id: sessionB } })).count).toBe(0);
    expect((await owner.academicSession.findUnique({ where: { id: sessionB } }))?.name).toBe('B-2026');
  });

  it('creates are forced into the caller school even if another schoolId is supplied', async () => {
    const created = await forSchool(app, schoolA).academicSession.create({
      data: { schoolId: schoolB, name: 'forced', startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31') },
    });
    expect(created.schoolId).toBe(schoolA);
  });

  it('the database itself rejects a write for another school (RLS WITH CHECK)', async () => {
    await expect(
      tenantTransaction(app, schoolA, (tx) =>
        tx.academicSession.create({ data: { schoolId: schoolB, name: 'sneaky', startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31') } }),
      ),
    ).rejects.toThrow();
  });

  it('without any school context a query returns nothing', async () => {
    expect(await app.academicSession.findMany()).toEqual([]);
  });

  it('a school cannot see another school record in the schools table', async () => {
    const schools = await forSchool(app, schoolA).school.findMany();
    expect(schools.map((s) => s.id)).toEqual([schoolA]);
  });
});
