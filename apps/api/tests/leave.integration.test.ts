/**
 * Real database test of Phase 14 leave. Needs the migration with the leave_* tables and the staff_attendance.leave_request_id column, and `pnpm db:rls`.
 * Run:  set RUN_DB_TESTS=1  then  pnpm --filter @nexora/api test
 * Worked numbers (today = 2026-11-04): Casual leave allows 10 days a year. Sara asks 3 days (9-11 Nov), HR approves: 3 used, 7 left.
 * She then asks 8 days (refused, 3 + 8 > 10) and 7 days (16-22 Nov, accepted and approved: 10 used, 0 left).
 * On 10 Nov Sara was already marked PRESENT, so approval writes LEAVE on 9 and 11 Nov only.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LeaveService } from '../src/modules/leave/leave.service';
import type { LeaveActor } from '../src/modules/leave/leave.types';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('leave (PostgreSQL)', () => {
  let owner: PrismaClient; let runtime: PrismaClient; let svc: LeaveService;
  const tag = `lea-${Date.now()}`;
  let a = ''; let b = '';
  let saraStaff = ''; let hrStaff = ''; let otherStaff = '';
  let saraUser = ''; let hrUser = '';
  let casual = ''; let unpaid = '';
  let first = ''; // L-000001
  const day = (s: string) => new Date(`${s}T00:00:00Z`);
  const sara = (): LeaveActor => ({ userId: saraUser, canApprove: false, canSeeAll: false });
  const hr = (): LeaveActor => ({ userId: hrUser, canApprove: true, canSeeAll: true });

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    svc = new LeaveService(runtime, () => new Date('2026-11-04T09:00:00Z'));
    a = (await owner.school.create({ data: { name: `${tag} A`, code: `${tag}-a` } })).id;
    b = (await owner.school.create({ data: { name: `${tag} B`, code: `${tag}-b` } })).id;
    const teacherRole = (await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'teacher' } })).id;
    const hrRole = (await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'hr_manager' } })).id;
    const user = (key: string, roleId: string) => owner.user.create({ data: { schoolId: a, roleId, email: `${tag}-${key}@example.test`, passwordHash: 'x', firstName: key, lastName: 'U' } });
    saraUser = (await user('sara', teacherRole)).id;
    hrUser = (await user('hr', hrRole)).id;
    const staff = (n: string, userId: string | null) => owner.staff.create({
      data: { schoolId: a, employeeNo: `${tag}-${n}`, firstName: n, lastName: 'S', gender: 'FEMALE', phone: '0300-0000000', category: 'TEACHING', designation: 'Teacher', joiningDate: day('2025-01-01'), userId },
    });
    saraStaff = (await staff('Sara', saraUser)).id;
    hrStaff = (await staff('Hira', hrUser)).id;
    otherStaff = (await staff('Omar', null)).id;
  });
  afterAll(async () => {
    await owner.school.deleteMany({ where: { id: { in: [a, b] } } }).catch(() => {});
    await owner.$disconnect(); await runtime.$disconnect();
  });

  it('adds the common leave types once, refuses a duplicate name (any case)', async () => {
    const r = await svc.addDefaultTypes(a, hrUser);
    expect(r.created).toBe(4);
    expect((await svc.addDefaultTypes(a, hrUser)).created).toBe(0);
    casual = r.types.find((t) => t.name === 'Casual leave')!.id;
    unpaid = r.types.find((t) => t.name === 'Unpaid leave')!.id;
    expect(r.types.find((t) => t.id === casual)).toMatchObject({ yearlyQuota: 10, paid: true });
    expect(r.types.find((t) => t.id === unpaid)).toMatchObject({ yearlyQuota: null, paid: false });
    await expect(svc.createType(a, hrUser, { name: 'casual LEAVE' })).rejects.toMatchObject({ status: 409 });
    expect((await svc.createType(b, hrUser, { name: 'Casual leave', yearlyQuota: 3 })).name).toBe('Casual leave'); // other school is free to reuse the name
  });

  it('a staff member applies for herself: numbered, pending, and refuses bad ranges and overlaps', async () => {
    await owner.staffAttendance.create({ data: { schoolId: a, staffId: saraStaff, date: day('2026-11-10'), status: 'PRESENT' } });
    const r = await svc.apply(a, sara(), { leaveTypeId: casual, fromDate: '2026-11-09', toDate: '2026-11-11', reason: 'Family wedding' });
    first = r.id;
    expect(r).toMatchObject({ requestNo: 'L-000001', status: 'PENDING', days: 3, fromDate: '2026-11-09', toDate: '2026-11-11' });
    expect(r.staff.id).toBe(saraStaff);
    await expect(svc.apply(a, sara(), { leaveTypeId: casual, fromDate: '2026-11-11', toDate: '2026-11-12' })).rejects.toMatchObject({ status: 409 }); // shares 11 Nov
    await expect(svc.apply(a, sara(), { leaveTypeId: casual, fromDate: '2026-11-20', toDate: '2026-11-19' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.apply(a, sara(), { leaveTypeId: casual, fromDate: '2024-12-30', toDate: '2024-12-31' })).rejects.toMatchObject({ status: 400 }); // before joining
    await expect(svc.apply(a, sara(), { leaveTypeId: casual, fromDate: '2026-11-20', toDate: '2026-11-20', staffId: otherStaff })).rejects.toMatchObject({ status: 403 });
    await expect(svc.apply(a, { userId: '00000000-0000-4000-8000-000000000000', canApprove: false, canSeeAll: false }, { leaveTypeId: casual, fromDate: '2026-11-20', toDate: '2026-11-20' })).rejects.toMatchObject({ status: 400 });
  });

  it('only an approver decides; approval writes LEAVE days but keeps a day she worked', async () => {
    await expect(svc.approve(a, sara(), first, null)).rejects.toMatchObject({ status: 403 });
    const ok = await svc.approve(a, hr(), first, 'Enjoy');
    expect(ok.status).toBe('APPROVED'); expect(ok.decisionNote).toBe('Enjoy');
    const rows = await owner.staffAttendance.findMany({ where: { staffId: saraStaff }, orderBy: { date: 'asc' } });
    expect(rows.map((r) => [r.date.toISOString().slice(0, 10), r.status])).toEqual([['2026-11-09', 'LEAVE'], ['2026-11-10', 'PRESENT'], ['2026-11-11', 'LEAVE']]);
    expect(rows[0].leaveRequestId).toBe(first); expect(rows[1].leaveRequestId).toBeNull();
    await expect(svc.approve(a, hr(), first, null)).rejects.toMatchObject({ status: 409 }); // already decided
  });

  it('balances follow the yearly quota; a request over the quota is refused', async () => {
    let bal = await svc.balances(a, sara(), undefined, 2026);
    expect(bal.balances.find((x) => x.leaveType.id === casual)!.balance).toEqual({ quota: 10, used: 3, pending: 0, remaining: 7 });
    expect(bal.balances.find((x) => x.leaveType.id === unpaid)!.balance.remaining).toBeNull();
    await expect(svc.apply(a, sara(), { leaveTypeId: casual, fromDate: '2026-11-16', toDate: '2026-11-23' })).rejects.toMatchObject({ status: 409 }); // 3 + 8 > 10
    const seven = await svc.apply(a, sara(), { leaveTypeId: casual, fromDate: '2026-11-16', toDate: '2026-11-22' });
    bal = await svc.balances(a, sara(), undefined, 2026);
    expect(bal.balances.find((x) => x.leaveType.id === casual)!.balance).toEqual({ quota: 10, used: 3, pending: 7, remaining: 7 });
    await svc.approve(a, hr(), seven.id, null);
    bal = await svc.balances(a, sara(), undefined, 2026);
    expect(bal.balances.find((x) => x.leaveType.id === casual)!.balance).toEqual({ quota: 10, used: 10, pending: 0, remaining: 0 });
    await expect(svc.apply(a, sara(), { leaveTypeId: casual, fromDate: '2026-12-01', toDate: '2026-12-01' })).rejects.toMatchObject({ status: 409 });
    expect((await svc.balances(a, sara(), undefined, 2027)).balances.find((x) => x.leaveType.id === casual)!.balance.used).toBe(0); // a new year starts fresh
    await expect(svc.balances(a, sara(), otherStaff, 2026)).rejects.toMatchObject({ status: 403 }); // cannot look at somebody else
  });

  it('nobody approves their own request; an approver may undo an approved one (LEAVE days go away)', async () => {
    const mine = await svc.apply(a, hr(), { leaveTypeId: unpaid, fromDate: '2026-11-25', toDate: '2026-11-25' });
    await expect(svc.approve(a, hr(), mine.id, null)).rejects.toMatchObject({ status: 403 });
    await expect(svc.reject(a, hr(), mine.id, null)).rejects.toMatchObject({ status: 403 });
    const onBehalf = await svc.apply(a, hr(), { leaveTypeId: unpaid, fromDate: '2026-11-26', toDate: '2026-11-27', staffId: otherStaff });
    expect(onBehalf.staff.id).toBe(otherStaff);
    await svc.approve(a, hr(), onBehalf.id, null);
    expect(await owner.staffAttendance.count({ where: { staffId: otherStaff, status: 'LEAVE' } })).toBe(2);
    const undone = await svc.cancel(a, hr(), onBehalf.id);
    expect(undone.status).toBe('CANCELLED');
    expect(await owner.staffAttendance.count({ where: { staffId: otherStaff } })).toBe(0);
    await expect(svc.cancel(a, hr(), onBehalf.id)).rejects.toMatchObject({ status: 409 });
    expect(hrStaff).toBeTruthy();
  });

  it('the owner can withdraw a waiting request but not undo an approved one', async () => {
    const waiting = await svc.apply(a, sara(), { leaveTypeId: unpaid, fromDate: '2026-12-10', toDate: '2026-12-10' });
    expect((await svc.cancel(a, sara(), waiting.id)).status).toBe('CANCELLED');
    await expect(svc.cancel(a, sara(), first)).rejects.toMatchObject({ status: 403 }); // approved
    const rejected = await svc.apply(a, sara(), { leaveTypeId: unpaid, fromDate: '2026-12-11', toDate: '2026-12-11' });
    expect((await svc.reject(a, hr(), rejected.id, 'Exam day')).status).toBe('REJECTED');
  });

  it('a staff member sees only her own requests; HR sees all; another school sees none', async () => {
    const mine = await svc.list(a, sara(), {});
    expect(mine.requests.length).toBeGreaterThan(0);
    expect(mine.requests.every((r) => r.staff.id === saraStaff)).toBe(true);
    const spy = await svc.list(a, sara(), { staffId: otherStaff });
    expect(spy.requests.every((r) => r.staff.id === saraStaff)).toBe(true); // the filter cannot widen her view
    const all = await svc.list(a, hr(), {});
    expect(new Set(all.requests.map((r) => r.staff.id)).size).toBeGreaterThan(1);
    expect((await svc.list(a, hr(), { status: 'REJECTED' })).requests).toHaveLength(1);
    expect((await svc.list(b, hr(), {})).requests).toHaveLength(0);
    await expect(svc.approve(b, hr(), first, null)).rejects.toMatchObject({ status: 404 });
  });
});
