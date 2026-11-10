import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors';
import {
  DEFAULT_LEAVE_TYPES, LEAVE_COUNTER, MAX_LEAVE_DAYS, balanceOf, eachDay, inclusiveDays, leaveDaysToWrite, leaveNo, leaveYear, rangesOverlap, withinQuota, type LeaveStatusValue,
} from './leave.logic';
import type {
  BalancesDto, LeaveActor, LeaveApi, LeaveApplyInput, LeaveFilter, LeaveRequestDto, LeaveTypeDto, LeaveTypeInput, LeaveTypePatch,
} from './leave.types';

type Tx = Prisma.TransactionClient;
const LIST_LIMIT = 300;
const dayText = (d: Date): string => d.toISOString().slice(0, 10);
const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);
const blank = (v: string | null | undefined): string | null => (v === undefined || v === null || v.trim() === '' ? null : v.trim());

const requestInclude = {
  staff: { select: { id: true, employeeNo: true, firstName: true, lastName: true, userId: true, status: true, joiningDate: true } },
  leaveType: { select: { id: true, name: true, paid: true } },
} as const;
type RequestRow = Prisma.LeaveRequestGetPayload<{ include: typeof requestInclude }>;

const typeDto = (t: { id: string; name: string; yearlyQuota: number | null; paid: boolean; active: boolean }): LeaveTypeDto => ({
  id: t.id, name: t.name, yearlyQuota: t.yearlyQuota, paid: t.paid, active: t.active,
});

/** Leave types, requests, approval and yearly balances. An approved request writes LEAVE days into the staff attendance. */
export class LeaveService implements LeaveApi {
  constructor(private readonly prisma: PrismaClient, private readonly now: () => Date = () => new Date()) {}

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string | null, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: 'leave', entityId, metadata } });
  }

  private async reserve(tx: Tx, schoolId: string, key: string): Promise<number> {
    const c = await tx.schoolCounter.upsert({ where: { schoolId_key: { schoolId, key } }, update: { value: { increment: 1 } }, create: { schoolId, key, value: 1 } });
    return c.value;
  }

  private dto(r: RequestRow): LeaveRequestDto {
    return {
      id: r.id, requestNo: r.requestNo, staff: { id: r.staff.id, employeeNo: r.staff.employeeNo, name: `${r.staff.firstName} ${r.staff.lastName}` },
      leaveType: { id: r.leaveType.id, name: r.leaveType.name, paid: r.leaveType.paid }, fromDate: dayText(r.fromDate), toDate: dayText(r.toDate), days: r.days,
      reason: r.reason, status: r.status as LeaveStatusValue, decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null, decisionNote: r.decisionNote, createdAt: r.createdAt.toISOString(),
    };
  }

  private myStaff(tx: Tx, schoolId: string, userId: string) {
    return tx.staff.findFirst({ where: { schoolId, userId, deletedAt: null }, select: { id: true, employeeNo: true, firstName: true, lastName: true } });
  }

  private async loadRequest(tx: Tx, schoolId: string, id: string): Promise<RequestRow> {
    const r = await tx.leaveRequest.findFirst({ where: { id, schoolId }, include: requestInclude });
    if (!r) throw notFound('Leave request not found');
    return r;
  }

  private lockRequest(tx: Tx, id: string): Promise<unknown> {
    return tx.$queryRaw`SELECT id FROM leave_requests WHERE id = ${id}::uuid FOR UPDATE`;
  }

  /** Approved days of one type for one staff member in the year a request starts in. */
  private async approvedDays(tx: Tx, schoolId: string, staffId: string, leaveTypeId: string, year: number, exceptId?: string): Promise<number> {
    const rows = await tx.leaveRequest.findMany({
      where: { schoolId, staffId, leaveTypeId, status: 'APPROVED', fromDate: { gte: toDate(`${year}-01-01`), lte: toDate(`${year}-12-31`) }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { days: true },
    });
    return rows.reduce((n, r) => n + r.days, 0);
  }

  // ---- leave types -----------------------------------------------------------------------------------------------------
  listTypes(schoolId: string, includeInactive: boolean): Promise<LeaveTypeDto[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const rows = await tx.leaveType.findMany({ where: { schoolId, ...(includeInactive ? {} : { active: true }) }, orderBy: { name: 'asc' } });
      return rows.map(typeDto);
    });
  }

  createType(schoolId: string, actorId: string, input: LeaveTypeInput): Promise<LeaveTypeDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const name = input.name.trim();
      if (await tx.leaveType.findFirst({ where: { schoolId, name: { equals: name, mode: 'insensitive' } }, select: { id: true } })) throw conflict('A leave type with this name already exists');
      const t = await tx.leaveType.create({ data: { schoolId, name, yearlyQuota: input.yearlyQuota ?? null, paid: input.paid ?? true } });
      await this.audit(tx, schoolId, actorId, 'leave.type.create', t.id, { name, yearlyQuota: t.yearlyQuota, paid: t.paid });
      return typeDto(t);
    });
  }

  updateType(schoolId: string, actorId: string, id: string, patch: LeaveTypePatch): Promise<LeaveTypeDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const t = await tx.leaveType.findFirst({ where: { id, schoolId } });
      if (!t) throw notFound('Leave type not found');
      const data: Prisma.LeaveTypeUncheckedUpdateInput = {};
      if (patch.name !== undefined) {
        const name = patch.name.trim();
        const dup = await tx.leaveType.findFirst({ where: { schoolId, id: { not: id }, name: { equals: name, mode: 'insensitive' } }, select: { id: true } });
        if (dup) throw conflict('A leave type with this name already exists');
        data.name = name;
      }
      if (patch.yearlyQuota !== undefined) data.yearlyQuota = patch.yearlyQuota;
      if (patch.paid !== undefined) data.paid = patch.paid;
      if (patch.active !== undefined) data.active = patch.active;
      const u = await tx.leaveType.update({ where: { id }, data });
      await this.audit(tx, schoolId, actorId, 'leave.type.update', id, { ...patch });
      return typeDto(u);
    });
  }

  addDefaultTypes(schoolId: string, actorId: string): Promise<{ created: number; types: LeaveTypeDto[] }> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const have = new Set((await tx.leaveType.findMany({ where: { schoolId }, select: { name: true } })).map((t) => t.name.toLowerCase()));
      const missing = DEFAULT_LEAVE_TYPES.filter((d) => !have.has(d.name.toLowerCase()));
      for (const d of missing) await tx.leaveType.create({ data: { schoolId, name: d.name, yearlyQuota: d.yearlyQuota, paid: d.paid } });
      if (missing.length > 0) await this.audit(tx, schoolId, actorId, 'leave.type.defaults', null, { created: missing.length });
      const rows = await tx.leaveType.findMany({ where: { schoolId, active: true }, orderBy: { name: 'asc' } });
      return { created: missing.length, types: rows.map(typeDto) };
    });
  }

  // ---- requests --------------------------------------------------------------------------------------------------------
  list(schoolId: string, actor: LeaveActor, filter: LeaveFilter & { mine?: boolean }): Promise<{ requests: LeaveRequestDto[]; truncated: boolean }> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      let staffId = filter.staffId;
      if (filter.mine === true || !actor.canSeeAll) {
        const me = await this.myStaff(tx, schoolId, actor.userId);
        if (!me) return { requests: [], truncated: false };
        staffId = me.id;
      }
      const rows = await tx.leaveRequest.findMany({
        where: {
          schoolId, ...(staffId ? { staffId } : {}), ...(filter.status ? { status: filter.status } : {}),
          ...(filter.from ? { toDate: { gte: toDate(filter.from) } } : {}), ...(filter.to ? { fromDate: { lte: toDate(filter.to) } } : {}),
        },
        include: requestInclude, orderBy: [{ createdAt: 'desc' }], take: LIST_LIMIT + 1,
      });
      return { requests: rows.slice(0, LIST_LIMIT).map((r) => this.dto(r)), truncated: rows.length > LIST_LIMIT };
    });
  }

  apply(schoolId: string, actor: LeaveActor, input: LeaveApplyInput): Promise<LeaveRequestDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const me = await this.myStaff(tx, schoolId, actor.userId);
      const targetId = input.staffId ?? me?.id;
      if (!targetId) throw badRequest('Your login is not linked to a staff profile, so you cannot apply for leave. Ask HR to link it.');
      if (targetId !== me?.id && !actor.canApprove) throw forbidden('You can only apply for leave for yourself');
      const staff = await tx.staff.findFirst({ where: { id: targetId, schoolId, deletedAt: null } });
      if (!staff) throw notFound('Staff member not found');
      if (staff.status !== 'ACTIVE') throw badRequest('This staff member has left the school');

      if (input.toDate < input.fromDate) throw badRequest('The last day cannot be before the first day');
      const days = inclusiveDays(input.fromDate, input.toDate);
      if (days > MAX_LEAVE_DAYS) throw badRequest(`One request can cover at most ${MAX_LEAVE_DAYS} days`);
      if (input.fromDate < dayText(staff.joiningDate)) throw badRequest('Leave cannot start before the joining date');

      const type = await tx.leaveType.findFirst({ where: { id: input.leaveTypeId, schoolId } });
      if (!type) throw notFound('Leave type not found');
      if (!type.active) throw badRequest('This leave type is not in use');

      const open = await tx.leaveRequest.findMany({
        where: { schoolId, staffId: staff.id, status: { in: ['PENDING', 'APPROVED'] }, fromDate: { lte: toDate(input.toDate) }, toDate: { gte: toDate(input.fromDate) } },
        select: { requestNo: true, fromDate: true, toDate: true },
      });
      const clash = open.find((o) => rangesOverlap(dayText(o.fromDate), dayText(o.toDate), input.fromDate, input.toDate));
      if (clash) throw conflict(`These days overlap leave request ${clash.requestNo}`);

      const used = await this.approvedDays(tx, schoolId, staff.id, type.id, leaveYear(input.fromDate));
      if (!withinQuota(type.yearlyQuota, used, days)) {
        throw conflict(`Not enough ${type.name} left this year (${used} of ${type.yearlyQuota} days used, ${days} asked)`, { quota: type.yearlyQuota, used, asked: days });
      }

      const n = await this.reserve(tx, schoolId, LEAVE_COUNTER);
      const created = await tx.leaveRequest.create({
        data: {
          schoolId, requestNo: leaveNo(n), staffId: staff.id, leaveTypeId: type.id, fromDate: toDate(input.fromDate), toDate: toDate(input.toDate), days,
          reason: blank(input.reason), appliedById: actor.userId,
        },
        include: requestInclude,
      });
      await this.audit(tx, schoolId, actor.userId, 'leave.apply', created.id, { requestNo: created.requestNo, staffId: staff.id, type: type.name, days });
      return this.dto(created);
    });
  }

  approve(schoolId: string, actor: LeaveActor, id: string, note: string | null): Promise<LeaveRequestDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      if (!actor.canApprove) throw forbidden();
      await this.lockRequest(tx, id);
      const r = await this.loadRequest(tx, schoolId, id);
      if (r.status !== 'PENDING') throw conflict(`This request is already ${r.status.toLowerCase()}`);
      if (r.staff.userId !== null && r.staff.userId === actor.userId) throw forbidden('You cannot decide your own leave request');
      if (r.staff.status !== 'ACTIVE') throw badRequest('This staff member has left the school');

      const from = dayText(r.fromDate);
      const to = dayText(r.toDate);
      const used = await this.approvedDays(tx, schoolId, r.staffId, r.leaveTypeId, leaveYear(from), id);
      const type = await tx.leaveType.findFirst({ where: { id: r.leaveTypeId, schoolId }, select: { yearlyQuota: true, name: true } });
      if (!withinQuota(type?.yearlyQuota ?? null, used, r.days)) {
        throw conflict(`Not enough ${type?.name ?? 'leave'} left this year (${used} of ${type?.yearlyQuota} days used, ${r.days} asked)`, { quota: type?.yearlyQuota, used, asked: r.days });
      }

      await tx.leaveRequest.update({ where: { id }, data: { status: 'APPROVED', decidedById: actor.userId, decidedAt: this.now(), decisionNote: blank(note) } });

      // Turn the approved days into LEAVE in the staff attendance (days already marked PRESENT or LATE stay as they are).
      const existing = await tx.staffAttendance.findMany({ where: { schoolId, staffId: r.staffId, date: { gte: toDate(from), lte: toDate(to) } }, select: { date: true, status: true } });
      const marked: Record<string, string> = {};
      for (const e of existing) marked[dayText(e.date)] = e.status;
      const remark = `Leave ${r.requestNo}`;
      for (const d of leaveDaysToWrite(eachDay(from, to), marked)) {
        await tx.staffAttendance.upsert({
          where: { staffId_date: { staffId: r.staffId, date: toDate(d) } },
          update: { status: 'LEAVE', remark, leaveRequestId: id, markedById: actor.userId },
          create: { schoolId, staffId: r.staffId, date: toDate(d), status: 'LEAVE', remark, leaveRequestId: id, markedById: actor.userId },
        });
      }
      await this.audit(tx, schoolId, actor.userId, 'leave.approve', id, { requestNo: r.requestNo, staffId: r.staffId, days: r.days });
      return this.dto(await this.loadRequest(tx, schoolId, id));
    });
  }

  reject(schoolId: string, actor: LeaveActor, id: string, note: string | null): Promise<LeaveRequestDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      if (!actor.canApprove) throw forbidden();
      await this.lockRequest(tx, id);
      const r = await this.loadRequest(tx, schoolId, id);
      if (r.status !== 'PENDING') throw conflict(`This request is already ${r.status.toLowerCase()}`);
      if (r.staff.userId !== null && r.staff.userId === actor.userId) throw forbidden('You cannot decide your own leave request');
      await tx.leaveRequest.update({ where: { id }, data: { status: 'REJECTED', decidedById: actor.userId, decidedAt: this.now(), decisionNote: blank(note) } });
      await this.audit(tx, schoolId, actor.userId, 'leave.reject', id, { requestNo: r.requestNo, staffId: r.staffId });
      return this.dto(await this.loadRequest(tx, schoolId, id));
    });
  }

  cancel(schoolId: string, actor: LeaveActor, id: string): Promise<LeaveRequestDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await this.lockRequest(tx, id);
      const r = await this.loadRequest(tx, schoolId, id);
      const own = r.staff.userId !== null && r.staff.userId === actor.userId;
      if (r.status === 'REJECTED' || r.status === 'CANCELLED') throw conflict(`This request is already ${r.status.toLowerCase()}`);
      // The owner may withdraw a request that is still waiting; only an approver may undo an approved one.
      if (r.status === 'PENDING' ? !(own || actor.canApprove) : !actor.canApprove) throw forbidden('You cannot cancel this request');
      if (r.status === 'APPROVED') await tx.staffAttendance.deleteMany({ where: { schoolId, leaveRequestId: id } });
      await tx.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED', decidedById: actor.userId, decidedAt: this.now() } });
      await this.audit(tx, schoolId, actor.userId, 'leave.cancel', id, { requestNo: r.requestNo, wasApproved: r.status === 'APPROVED' });
      return this.dto(await this.loadRequest(tx, schoolId, id));
    });
  }

  // ---- balances --------------------------------------------------------------------------------------------------------
  balances(schoolId: string, actor: LeaveActor, staffId: string | undefined, year: number): Promise<BalancesDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const me = await this.myStaff(tx, schoolId, actor.userId);
      const targetId = staffId ?? me?.id;
      if (!targetId) throw badRequest('Your login is not linked to a staff profile');
      if (targetId !== me?.id && !actor.canSeeAll) throw forbidden();
      const staff = await tx.staff.findFirst({ where: { id: targetId, schoolId, deletedAt: null }, select: { id: true, employeeNo: true, firstName: true, lastName: true } });
      if (!staff) throw notFound('Staff member not found');
      const types = await tx.leaveType.findMany({ where: { schoolId, active: true }, orderBy: { name: 'asc' } });
      const rows = await tx.leaveRequest.findMany({
        where: { schoolId, staffId: staff.id, status: { in: ['APPROVED', 'PENDING'] }, fromDate: { gte: toDate(`${year}-01-01`), lte: toDate(`${year}-12-31`) } },
        select: { leaveTypeId: true, status: true, days: true },
      });
      return {
        staff: { id: staff.id, employeeNo: staff.employeeNo, name: `${staff.firstName} ${staff.lastName}` }, year,
        balances: types.map((t) => {
          const mine = rows.filter((r) => r.leaveTypeId === t.id);
          const used = mine.filter((r) => r.status === 'APPROVED').reduce((n, r) => n + r.days, 0);
          const pending = mine.filter((r) => r.status === 'PENDING').reduce((n, r) => n + r.days, 0);
          return { leaveType: { id: t.id, name: t.name, paid: t.paid }, balance: balanceOf(t.yearlyQuota, used, pending) };
        }),
      };
    });
  }
}
