/**
 * Real database test of Phase 13C (hostel). Needs the migration with the hostel* tables, `pnpm db:rls`, `pnpm db:seed` (adds the hostel_warden role).
 * Run:  set RUN_DB_TESTS=1  then  pnpm --filter @nexora/api test
 * Worked numbers: "Iqbal House" (boys) room A-1 has 2 beds at Rs 6,000; room A-2 has 1 bed, free. Ali and Bilal move into A-1, Cara is refused (full),
 * Dania (a girl) is refused (boys hostel). Tuition is Rs 5,000: with the hostel line Bilal's voucher is 5,000 + 6,000 = 11,000.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FeesService } from '../src/modules/fees/fees.service';
import { HostelService } from '../src/modules/hostel/hostel.service';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('hostel (PostgreSQL)', () => {
  let owner: PrismaClient; let runtime: PrismaClient;
  let hs: HostelService; let fees: FeesService;
  const tag = `hos-${Date.now()}`;
  let a = ''; let b = ''; let actor = ''; let classId = '';
  const kid: Record<string, string> = {};
  let boys = ''; let girls = ''; let a1 = ''; let a2 = ''; let g1 = '';

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    hs = new HostelService(runtime, () => new Date('2026-11-04T09:00:00Z'));
    fees = new FeesService(runtime, () => new Date('2026-11-04T09:00:00Z'));
    a = (await owner.school.create({ data: { name: `${tag} A`, code: `${tag}-a` } })).id;
    b = (await owner.school.create({ data: { name: `${tag} B`, code: `${tag}-b` } })).id;
    const role = (await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'hostel_warden' } })).id;
    actor = (await owner.user.create({ data: { schoolId: a, roleId: role, email: `${tag}@example.test`, passwordHash: 'x', firstName: 'Host', lastName: 'Warden' } })).id;
    const cls = await owner.schoolClass.create({ data: { schoolId: a, name: 'Class 9', level: 1 } });
    classId = cls.id;
    const mk = (n: string, gender: string, status = 'ACTIVE') => owner.student.create({ data: { schoolId: a, admissionNo: `${tag}-${n}`, firstName: n, lastName: 'K', classId: cls.id, gender, status, dateOfBirth: new Date('2011-01-01T00:00:00Z'), admissionDate: new Date('2026-04-01T00:00:00Z') } as never });
    for (const n of ['Ali', 'Bilal', 'Cara']) kid[n] = (await mk(n, 'MALE')).id;
    kid.Dania = (await mk('Dania', 'FEMALE')).id;
    kid.gone = (await mk('Gone', 'MALE', 'WITHDRAWN')).id;
  });
  afterAll(async () => {
    await owner.school.deleteMany({ where: { id: { in: [a, b] } } }).catch(() => {});
    await owner.$disconnect(); await runtime.$disconnect();
  });

  it('creates hostels with a warden and refuses a duplicate name (any case), per school', async () => {
    const h = await hs.createHostel(a, actor, { name: 'Iqbal House', kind: 'BOYS', wardenName: 'Mr Khan', wardenPhone: '0300-1234567' });
    boys = h.id;
    expect(h.wardenName).toBe('Mr Khan'); expect(h.rooms).toBe(0);
    await expect(hs.createHostel(a, actor, { name: 'iqbal house', kind: 'GIRLS' })).rejects.toMatchObject({ status: 409 });
    expect((await hs.createHostel(b, actor, { name: 'Iqbal House', kind: 'BOYS' })).name).toBe('Iqbal House');
    girls = (await hs.createHostel(a, actor, { name: 'Fatima House', kind: 'GIRLS' })).id;
  });

  it('creates rooms; room numbers are tidy and unique inside a hostel', async () => {
    const r = await hs.createRoom(a, actor, { hostelId: boys, roomNo: ' a-1 ', floor: 1, beds: 2, monthlyFee: 6000 });
    a1 = r.id;
    expect(r.roomNo).toBe('A-1'); expect(r.bedState).toBe('FREE'); expect(r.hostelName).toBe('Iqbal House');
    await expect(hs.createRoom(a, actor, { hostelId: boys, roomNo: 'a-1', beds: 3 })).rejects.toMatchObject({ status: 409 });
    a2 = (await hs.createRoom(a, actor, { hostelId: boys, roomNo: 'A-2', beds: 1 })).id;
    g1 = (await hs.createRoom(a, actor, { hostelId: girls, roomNo: 'A-1', beds: 2, monthlyFee: 6000 })).id; // same number, other hostel
    await expect(hs.createRoom(a, actor, { hostelId: '00000000-0000-4000-8000-000000000000', roomNo: 'Z', beds: 1 })).rejects.toMatchObject({ status: 400 });
  });

  it('moves students in until the room is full; saving again in the same room is still allowed', async () => {
    const x = await hs.assign(a, actor, kid.Ali!, a1);
    expect(x.room.roomNo).toBe('A-1'); expect(x.hostel.name).toBe('Iqbal House'); expect(x.hostel.wardenName).toBe('Mr Khan');
    await hs.assign(a, actor, kid.Bilal!, a1);
    await expect(hs.assign(a, actor, kid.Cara!, a1)).rejects.toMatchObject({ status: 409 }); // 2 of 2 beds
    await hs.assign(a, actor, kid.Ali!, a1); // same room again
    const room = (await hs.listRooms(a, { hostelId: boys, includeInactive: true })).find((r) => r.id === a1)!;
    expect(room.bedState).toBe('FULL'); expect(room.residents).toBe(2); expect(room.income).toBe(12000); // 2 x 6,000
  });

  it('keeps girls and boys apart, and refuses withdrawn or unknown students', async () => {
    await expect(hs.assign(a, actor, kid.Dania!, a2)).rejects.toMatchObject({ status: 409 });
    expect((await hs.assign(a, actor, kid.Dania!, g1)).hostel.name).toBe('Fatima House');
    await expect(hs.assign(a, actor, kid.gone!, a2)).rejects.toMatchObject({ status: 400 });
    await expect(hs.assign(a, actor, '00000000-0000-4000-8000-000000000000', a2)).rejects.toMatchObject({ status: 404 });
    await expect(hs.assign(a, actor, kid.Cara!, '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ status: 404 });
  });

  it('moving a student to another room frees the bed', async () => {
    await hs.assign(a, actor, kid.Ali!, a2);
    expect((await hs.studentHostel(a, kid.Ali!)).allocation?.room.roomNo).toBe('A-2');
    await hs.assign(a, actor, kid.Cara!, a1); // Ali left, so a bed is free
    const rooms = await hs.listRooms(a, { hostelId: boys, includeInactive: false });
    expect(rooms.map((r) => [r.roomNo, r.residents])).toEqual([['A-1', 2], ['A-2', 1]]);
  });

  it('protects beds, kind and active flags', async () => {
    await expect(hs.updateRoom(a, actor, a1, { beds: 1 })).rejects.toMatchObject({ status: 409 }); // 2 live here
    expect((await hs.updateRoom(a, actor, a1, { beds: 3 })).beds).toBe(3);
    await expect(hs.updateRoom(a, actor, a1, { active: false })).rejects.toMatchObject({ status: 409 });
    await expect(hs.updateRoom(a, actor, a2, { roomNo: 'a-1' })).rejects.toMatchObject({ status: 409 }); // taken
    await expect(hs.updateHostel(a, actor, boys, { kind: 'GIRLS' })).rejects.toMatchObject({ status: 409 }); // boys live here
    await expect(hs.updateHostel(a, actor, boys, { active: false })).rejects.toMatchObject({ status: 409 });
    expect((await hs.updateHostel(a, actor, boys, { kind: 'MIXED' })).kind).toBe('MIXED');
    expect((await hs.assign(a, actor, kid.Dania!, a1)).hostel.kind).toBe('MIXED'); // a mixed hostel takes her; A-1 now holds Bilal, Cara, Dania = 3 of 3 beds
    expect((await hs.listRooms(a, { hostelId: boys, includeInactive: true })).find((r) => r.id === a1)!.bedState).toBe('FULL');
  });

  it('adds the hostel fee to a fee voucher only when asked, and not under the concession', async () => {
    const session = await owner.academicSession.create({ data: { schoolId: a, name: '2026-2027', startDate: new Date('2026-04-01T00:00:00Z'), endDate: new Date('2027-03-31T00:00:00Z'), isCurrent: true } });
    const head = await fees.createHead(a, actor, 'Tuition');
    await fees.setStructure(a, actor, classId, session.id, [{ feeHeadId: head.id, amount: 5000, frequency: 'MONTHLY' }]);
    await fees.setConcession(a, actor, kid.Bilal!, session.id, { kind: 'PERCENT', value: 10 });
    const plain = await fees.generate(a, actor, { classId, period: '2026-11', dueDate: '2026-11-10' });
    expect(plain.created).toBe(4); // Ali, Bilal, Cara, Dania (the withdrawn student is skipped)
    expect((await fees.listVouchers(a, { studentId: kid.Bilal!, period: '2026-11' }))[0]!.totalAmount).toBe(5000);
    const next = await fees.generate(a, actor, { classId, period: '2026-12', dueDate: '2026-12-10', includeHostel: true });
    expect(next.created).toBe(4);
    const bilal = (await fees.listVouchers(a, { studentId: kid.Bilal!, period: '2026-12' }))[0]!;
    expect(bilal.totalAmount).toBe(11000); // 5000 + 6000 hostel (A-1)
    expect(bilal.discountAmount).toBe(500); // 10% of 5000 only
    expect(bilal.netAmount).toBe(10500);
    const ali = (await fees.listVouchers(a, { studentId: kid.Ali!, period: '2026-12' }))[0]!;
    expect(ali.totalAmount).toBe(5000); // room A-2 is free, so no extra line
    const detail = await fees.getVoucher(a, bilal.id);
    expect(detail.items.map((i) => i.description)).toContain('Hostel - Iqbal House A-1');
  });

  it('removes a resident, and keeps schools apart', async () => {
    await hs.unassign(a, actor, kid.Cara!);
    await expect(hs.unassign(a, actor, kid.Cara!)).rejects.toMatchObject({ status: 404 });
    expect((await hs.listResidents(a, { roomId: a1 })).residents.map((r) => r.student.name).sort()).toEqual(['Bilal K', 'Dania K']);
    await expect(hs.updateRoom(b, actor, a1, { beds: 5 })).rejects.toMatchObject({ status: 404 });
    expect(await hs.listRooms(b, { includeInactive: true })).toHaveLength(0);
    await expect(hs.studentHostel(b, kid.Ali!)).rejects.toMatchObject({ status: 404 });
    const rls = await runtime.$transaction(async (tx) => { await tx.$executeRaw`SELECT set_config('app.school_id', ${b}, true)`; return tx.hostelAllocation.count(); });
    expect(rls).toBe(0);
    // 2 hostels, 3 rooms (A-1 3 beds, A-2 1 bed, Fatima A-1 2 beds) = 6 beds, 3 residents (Ali, Bilal, Dania), income = Bilal + Dania in A-1 = 2 x 6,000
    expect(await hs.summary(a)).toEqual({ hostels: 2, rooms: 3, beds: 6, residents: 3, freeBeds: 3, monthlyIncome: 12000, overCapacity: 0 });
    const audit = await owner.auditLog.findMany({ where: { schoolId: a, action: { startsWith: 'hostel.' } }, select: { action: true } });
    expect(audit.filter((x) => x.action === 'hostel.assign').length).toBeGreaterThanOrEqual(7);
  });
});
