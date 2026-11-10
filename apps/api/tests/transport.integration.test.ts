/**
 * Real database test of Phase 13B (transport). Needs the migration with the transport_* tables, `pnpm db:rls`, `pnpm db:seed`.
 * Run:  set RUN_DB_TESTS=1  then  pnpm --filter @nexora/api test
 * Worked numbers: bus ABC-100 has 2 seats; route "North" costs Rs 2,500 a month; Ali and Bilal board, Cara is refused (route full).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FeesService } from '../src/modules/fees/fees.service';
import { TransportService } from '../src/modules/transport/transport.service';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('transport (PostgreSQL)', () => {
  let owner: PrismaClient; let runtime: PrismaClient;
  let tr: TransportService; let fees: FeesService;
  const tag = `trn-${Date.now()}`;
  let a = ''; let b = ''; let actor = ''; let classId = '';
  const kid: Record<string, string> = {};
  let vehicleId = ''; let routeId = ''; let stop1 = ''; let stop2 = ''; let route2 = '';

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    tr = new TransportService(runtime, () => new Date('2026-11-04T09:00:00Z'));
    fees = new FeesService(runtime, () => new Date('2026-11-04T09:00:00Z'));
    a = (await owner.school.create({ data: { name: `${tag} A`, code: `${tag}-a` } })).id;
    b = (await owner.school.create({ data: { name: `${tag} B`, code: `${tag}-b` } })).id;
    const role = (await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'transport_manager' } })).id;
    actor = (await owner.user.create({ data: { schoolId: a, roleId: role, email: `${tag}@example.test`, passwordHash: 'x', firstName: 'Tran', lastName: 'Sport' } })).id;
    const cls = await owner.schoolClass.create({ data: { schoolId: a, name: 'Class 5', level: 1 } });
    classId = cls.id;
    const mk = (n: string, status = 'ACTIVE') => owner.student.create({ data: { schoolId: a, admissionNo: `${tag}-${n}`, firstName: n, lastName: 'K', classId: cls.id, gender: 'MALE', status, dateOfBirth: new Date('2015-01-01T00:00:00Z'), admissionDate: new Date('2026-04-01T00:00:00Z') } as never });
    for (const n of ['Ali', 'Bilal', 'Cara']) kid[n] = (await mk(n)).id;
    kid.gone = (await mk('Gone', 'WITHDRAWN')).id;
  });
  afterAll(async () => {
    await owner.school.deleteMany({ where: { id: { in: [a, b] } } }).catch(() => {});
    await owner.$disconnect(); await runtime.$disconnect();
  });

  it('creates a vehicle and refuses a duplicate registration (any case)', async () => {
    const v = await tr.createVehicle(a, actor, { registrationNo: 'abc-100', capacity: 2, driverName: 'Rafiq', driverPhone: '0300-1234567' });
    vehicleId = v.id;
    expect(v.registrationNo).toBe('ABC-100');
    await expect(tr.createVehicle(a, actor, { registrationNo: 'ABC-100', capacity: 5 })).rejects.toMatchObject({ status: 409 });
    expect((await tr.createVehicle(b, actor, { registrationNo: 'ABC-100', capacity: 5 })).registrationNo).toBe('ABC-100'); // per school
  });

  it('creates a route with ordered stops and a vehicle', async () => {
    const r = await tr.createRoute(a, actor, { name: 'North', monthlyFee: 2500, vehicleId, stops: [{ name: 'Gate', pickupTime: '07:00' }, { name: 'Market', pickupTime: '07:15' }] });
    routeId = r.id;
    expect(r.stops.map((s) => [s.name, s.sequence])).toEqual([['Gate', 1], ['Market', 2]]);
    stop1 = r.stops[0]!.id; stop2 = r.stops[1]!.id;
    expect(r.seat).toBe('FREE');
    await expect(tr.createRoute(a, actor, { name: 'north', monthlyFee: 1 })).rejects.toMatchObject({ status: 409 });
    route2 = (await tr.createRoute(a, actor, { name: 'South', monthlyFee: 0, stops: [{ name: 'Canal' }] })).id;
  });

  it('boards students until the bus is full; changing stops on the same route is still allowed', async () => {
    const x = await tr.assign(a, actor, kid.Ali!, routeId, stop1);
    expect(x.route.name).toBe('North'); expect(x.vehicle?.registrationNo).toBe('ABC-100');
    await tr.assign(a, actor, kid.Bilal!, routeId, stop2);
    await expect(tr.assign(a, actor, kid.Cara!, routeId, stop1)).rejects.toMatchObject({ status: 409 }); // 2 of 2 seats
    expect((await tr.assign(a, actor, kid.Ali!, routeId, stop2)).stop.name).toBe('Market'); // move within the route
    expect((await tr.getRoute(a, routeId)).seat).toBe('FULL');
    expect((await tr.getRoute(a, routeId)).income).toBe(5000); // 2 x 2,500
  });

  it('refuses withdrawn students, foreign stops, and unknown students', async () => {
    await expect(tr.assign(a, actor, kid.gone!, route2, (await tr.getRoute(a, route2)).stops[0]!.id)).rejects.toMatchObject({ status: 400 });
    await expect(tr.assign(a, actor, kid.Cara!, route2, stop1)).rejects.toMatchObject({ status: 400 }); // stop belongs to another route
    await expect(tr.assign(a, actor, '00000000-0000-4000-8000-000000000000', route2, stop1)).rejects.toMatchObject({ status: 404 });
  });

  it('moving a student to another route frees the seat', async () => {
    const stopS = (await tr.getRoute(a, route2)).stops[0]!.id;
    await tr.assign(a, actor, kid.Bilal!, route2, stopS);
    expect((await tr.getRoute(a, routeId)).riders).toBe(1);
    expect((await tr.studentTransport(a, kid.Bilal!)).assignment?.route.name).toBe('South');
    await tr.assign(a, actor, kid.Cara!, routeId, stop1); // a seat is free again
    expect((await tr.getRoute(a, routeId)).seat).toBe('FULL');
  });

  it('keeps stops that have students, and only removes empty ones', async () => {
    const r = await tr.getRoute(a, routeId);
    await expect(tr.setStops(a, actor, routeId, [{ id: stop2, name: 'Market' }])).rejects.toMatchObject({ status: 409 }); // Gate has Cara
    const ok = await tr.setStops(a, actor, routeId, [{ id: stop1, name: 'Main Gate', pickupTime: '06:55' }, { name: 'Park', pickupTime: '07:30' }, { id: stop2, name: 'Market', pickupTime: '07:40' }]);
    expect(ok.stops.map((s) => s.name)).toEqual(['Main Gate', 'Park', 'Market']);
    expect(ok.stops.find((s) => s.id === stop1)!.riders).toBe(1);
    expect(r.stops).toHaveLength(2);
  });

  it('protects capacity and active flags', async () => {
    await expect(tr.updateVehicle(a, actor, vehicleId, { capacity: 1 })).rejects.toMatchObject({ status: 409 }); // route carries 2
    await expect(tr.updateVehicle(a, actor, vehicleId, { active: false })).rejects.toMatchObject({ status: 409 }); // still on a route
    await expect(tr.updateRoute(a, actor, routeId, { active: false })).rejects.toMatchObject({ status: 409 }); // has students
    const small = await tr.createVehicle(a, actor, { registrationNo: 'XYZ-1', capacity: 1 });
    await expect(tr.updateRoute(a, actor, routeId, { vehicleId: small.id })).rejects.toMatchObject({ status: 409 }); // 2 riders, 1 seat
  });

  it('adds the transport fee to a fee voucher only when asked, and not under the concession', async () => {
    const session = await owner.academicSession.create({ data: { schoolId: a, name: '2026-2027', startDate: new Date('2026-04-01T00:00:00Z'), endDate: new Date('2027-03-31T00:00:00Z'), isCurrent: true } });
    const head = await fees.createHead(a, actor, 'Tuition');
    await fees.setStructure(a, actor, classId, session.id, [{ feeHeadId: head.id, amount: 5000, frequency: 'MONTHLY' }]);
    await fees.setConcession(a, actor, kid.Ali!, session.id, { kind: 'PERCENT', value: 10 });
    const plain = await fees.generate(a, actor, { classId, period: '2026-11', dueDate: '2026-11-10' });
    expect(plain.created).toBe(3); // Ali, Bilal, Cara (the withdrawn student is skipped)
    expect((await fees.listVouchers(a, { studentId: kid.Ali! }))[0]!.totalAmount).toBe(5000);
    const next = await fees.generate(a, actor, { classId, period: '2026-12', dueDate: '2026-12-10', includeTransport: true });
    const ali = (await fees.listVouchers(a, { studentId: kid.Ali!, period: '2026-12' }))[0]!;
    expect(ali.totalAmount).toBe(7500); // 5000 + 2500 transport
    expect(ali.discountAmount).toBe(500); // 10% of 5000 only
    expect(ali.netAmount).toBe(7000);
    const bilal = (await fees.listVouchers(a, { studentId: kid.Bilal!, period: '2026-12' }))[0]!;
    expect(bilal.totalAmount).toBe(5000); // South route is free, so no extra line
    expect(next.created).toBe(3);
    const detail = await fees.getVoucher(a, ali.id);
    expect(detail.items.map((i) => i.description)).toContain('Transport - North');
  });

  it('removes a rider, and keeps schools apart', async () => {
    await tr.unassign(a, actor, kid.Cara!);
    await expect(tr.unassign(a, actor, kid.Cara!)).rejects.toMatchObject({ status: 404 });
    expect((await tr.listRiders(a, { routeId })).riders.map((r) => r.student.name)).toEqual(['Ali K']);
    await expect(tr.getRoute(b, routeId)).rejects.toMatchObject({ status: 404 });
    expect(await tr.listRoutes(b, true)).toHaveLength(0);
    await expect(tr.studentTransport(b, kid.Ali!)).rejects.toMatchObject({ status: 404 });
    const rls = await runtime.$transaction(async (tx) => { await tx.$executeRaw`SELECT set_config('app.school_id', ${b}, true)`; return tx.transportAssignment.count(); });
    expect(rls).toBe(0);
    const s = await tr.summary(a);
    expect(s.routes).toBe(2); expect(s.riders).toBe(2);
    const audit = await owner.auditLog.findMany({ where: { schoolId: a, action: { startsWith: 'transport.' } }, select: { action: true } });
    expect(audit.filter((x) => x.action === 'transport.assign').length).toBeGreaterThanOrEqual(5);
  });
});
