/**
 * Real database test of Phase 15B visitors. Needs the migration with `visits`, `pnpm db:rls`.
 * Run:  set RUN_DB_TESTS=1  then  pnpm --filter @nexora/api test
 * Worked numbers: Mr Tariq checks in 4 Nov 09:00 and out 09:45 = 45 minutes. Mrs Bano checks in 09:10 and stays inside.
 * A visitor from 2 Nov who was never checked out still counts as inside now (so a forgotten check-out is never hidden).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VisitorsService } from '../src/modules/visitors/visitors.service';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('visitors (PostgreSQL)', () => {
  let owner: PrismaClient; let runtime: PrismaClient; let svc: VisitorsService;
  const tag = `vis-${Date.now()}`;
  let a = ''; let b = ''; let actor = '';
  let clock = new Date('2026-11-04T09:00:00Z');
  let tariq = ''; let bano = '';

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    svc = new VisitorsService(runtime, () => clock);
    a = (await owner.school.create({ data: { name: `${tag} A`, code: `${tag}-a` } })).id;
    b = (await owner.school.create({ data: { name: `${tag} B`, code: `${tag}-b` } })).id;
    const role = (await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'receptionist' } })).id;
    actor = (await owner.user.create({ data: { schoolId: a, roleId: role, email: `${tag}@example.test`, passwordHash: 'x', firstName: 'Front', lastName: 'Desk' } })).id;
  });
  afterAll(async () => {
    await owner.school.deleteMany({ where: { id: { in: [a, b] } } }).catch(() => {});
    await owner.$disconnect(); await runtime.$disconnect();
  });

  it('checks visitors in with numbers; an unknown student is refused', async () => {
    const t = await svc.checkIn(a, actor, { name: ' Mr Tariq ', phone: '0300-1234567', purpose: 'Admission enquiry', visiting: 'Principal' });
    tariq = t.id;
    expect(t).toMatchObject({ visitNo: 'V-000001', name: 'Mr Tariq', inside: true, minutes: null, checkOutAt: null, student: null });
    clock = new Date('2026-11-04T09:10:00Z');
    const n = await svc.checkIn(a, actor, { name: 'Mrs Bano', purpose: 'Meet class teacher', notes: 'About homework' });
    bano = n.id;
    expect(n.visitNo).toBe('V-000002');
    await expect(svc.checkIn(a, actor, { name: 'Mr Ghost', purpose: 'Visit', studentId: '00000000-0000-4000-8000-000000000000' })).rejects.toMatchObject({ status: 404 });
    expect((await svc.checkIn(b, actor, { name: 'Other school guest', purpose: 'Visit' })).visitNo).toBe('V-000001'); // numbers are per school
  });

  it('checks out once and measures the time inside', async () => {
    clock = new Date('2026-11-04T09:45:00Z');
    const t = await svc.checkOut(a, actor, tariq);
    expect(t).toMatchObject({ inside: false, minutes: 45 });
    await expect(svc.checkOut(a, actor, tariq)).rejects.toMatchObject({ status: 409 });
    await expect(svc.checkOut(b, actor, bano)).rejects.toMatchObject({ status: 404 });
  });

  it('lists a day, who is inside, and searches; a forgotten check-out stays visible', async () => {
    await owner.visit.create({ data: { schoolId: a, visitNo: 'V-OLD', name: 'Forgot to sign out', purpose: 'Delivery', checkInAt: new Date('2026-11-02T08:00:00Z') } });
    expect(await svc.summary(a)).toEqual({ today: 2, inside: 2 });
    expect((await svc.list(a, { insideOnly: false })).visits.map((v) => v.name)).toEqual(['Mrs Bano', 'Mr Tariq']); // newest first, today only
    expect((await svc.list(a, { insideOnly: true })).visits.map((v) => v.name).sort()).toEqual(['Forgot to sign out', 'Mrs Bano']);
    expect((await svc.list(a, { date: '2026-11-03', insideOnly: false })).visits).toEqual([]);
    expect((await svc.list(a, { date: '2026-11-02', insideOnly: false })).visits.map((v) => v.visitNo)).toEqual(['V-OLD']);
    expect((await svc.list(a, { insideOnly: false, q: 'admission' })).visits.map((v) => v.name)).toEqual(['Mr Tariq']);
    expect((await svc.list(a, { insideOnly: false, q: '1234567' })).visits.map((v) => v.name)).toEqual(['Mr Tariq']);
  });

  it('edits details and keeps schools apart', async () => {
    const u = await svc.update(a, actor, bano, { visiting: 'Class 5 teacher', notes: null, phone: '0311-0000000' });
    expect(u).toMatchObject({ visiting: 'Class 5 teacher', notes: null, phone: '0311-0000000', name: 'Mrs Bano' });
    await expect(svc.update(b, actor, bano, { name: 'Hacked' })).rejects.toMatchObject({ status: 404 });
    expect(await svc.summary(b)).toEqual({ today: 1, inside: 1 });
    expect((await svc.list(b, { insideOnly: false })).visits.map((v) => v.name)).toEqual(['Other school guest']);
  });
});
