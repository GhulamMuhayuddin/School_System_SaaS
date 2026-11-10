import type { Prisma, PrismaClient } from '@prisma/client';
import { withBypass } from '../../db/tenant';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { hashPassword } from '../../utils/password';
import type {
  AuditLogDto, CreatePlatformAdminInput, CreateSchoolInput, PlanDto, PlanInput, PlatformAdminDto, PlatformAnalytics,
  PlatformApi, SchoolAdminDto, SchoolDetail, SchoolListItem, SchoolStatus, SubscriptionDto, SubscriptionInput,
  SubscriptionStatus, UpdateSchoolInput,
} from './platform.types';

type Tx = Prisma.TransactionClient;
const TRIAL_DAYS = 30;
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

type SubRow = { id: string; planId: string; status: SubscriptionStatus; startsAt: Date; endsAt: Date | null; plan: { name: string } };
const subDto = (s: SubRow): SubscriptionDto => ({
  id: s.id, planId: s.planId, planName: s.plan.name, status: s.status, startsAt: s.startsAt.toISOString(), endsAt: iso(s.endsAt),
});

type SchoolRow = {
  id: string; name: string; code: string; status: SchoolStatus; email: string | null; city: string | null; createdAt: Date;
  subscriptions: SubRow[]; _count: { users: number };
};
const listItem = (s: SchoolRow): SchoolListItem => ({
  id: s.id, name: s.name, code: s.code, status: s.status, email: s.email, city: s.city, createdAt: s.createdAt.toISOString(),
  userCount: s._count.users, subscription: s.subscriptions[0] ? subDto(s.subscriptions[0]) : null,
});
const latestSub = { orderBy: { createdAt: 'desc' as const }, take: 1, include: { plan: { select: { name: true } } } };
const listSelect = {
  id: true, name: true, code: true, status: true, email: true, city: true, createdAt: true,
  subscriptions: latestSub, _count: { select: { users: true } },
};

const planDto = (p: { id: string; name: string; priceMonthly: Prisma.Decimal | number; maxStudents: number | null; maxStaff: number | null; isActive: boolean; _count: { subscriptions: number } }): PlanDto => ({
  id: p.id, name: p.name, priceMonthly: Number(p.priceMonthly), maxStudents: p.maxStudents, maxStaff: p.maxStaff, isActive: p.isActive, schoolCount: p._count.subscriptions,
});

const adminDto = (u: { id: string; email: string; firstName: string; lastName: string; status: 'ACTIVE' | 'INACTIVE' | 'LOCKED'; lastLoginAt: Date | null; createdAt: Date }): PlatformAdminDto => ({
  id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, status: u.status, lastLoginAt: iso(u.lastLoginAt), createdAt: u.createdAt.toISOString(),
});

function parseEndsAt(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw badRequest('Invalid end date');
  return d;
}

export class PlatformService implements PlatformApi {
  constructor(private readonly prisma: PrismaClient) {}

  private audit(tx: Tx, actorId: string, action: string, schoolId: string | null, entityId: string | null, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: action.split('.')[1] ?? null, entityId, metadata } });
  }

  // ---------------------------------------------------------------- schools
  async listSchools(filter: { q?: string; status?: SchoolStatus }): Promise<SchoolListItem[]> {
    return withBypass(this.prisma, async (tx) => {
      const where: Prisma.SchoolWhereInput = { deletedAt: null };
      if (filter.status) where.status = filter.status;
      if (filter.q) where.OR = [{ name: { contains: filter.q, mode: 'insensitive' } }, { code: { contains: filter.q, mode: 'insensitive' } }];
      const rows = await tx.school.findMany({ where, orderBy: { createdAt: 'desc' }, select: listSelect });
      return (rows as unknown as SchoolRow[]).map(listItem);
    });
  }

  private async detail(tx: Tx, id: string): Promise<SchoolDetail> {
    const school = await tx.school.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...listSelect, phone: true, address: true, country: true, timezone: true,
        subscriptions: { orderBy: { createdAt: 'desc' }, include: { plan: { select: { name: true } } } },
      },
    });
    if (!school) throw notFound('School not found');
    const [classes, sections, subjects, admins] = await Promise.all([
      tx.schoolClass.count({ where: { schoolId: id } }),
      tx.section.count({ where: { schoolId: id } }),
      tx.subject.count({ where: { schoolId: id } }),
      tx.user.findMany({
        where: { schoolId: id, deletedAt: null, role: { key: 'school_admin' } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true, firstName: true, lastName: true, status: true, lastLoginAt: true },
      }),
    ]);
    const row = school as unknown as SchoolRow & { phone: string | null; address: string | null; country: string; timezone: string };
    return {
      ...listItem(row),
      phone: row.phone, address: row.address, country: row.country, timezone: row.timezone,
      counts: { users: row._count.users, classes, sections, subjects },
      admins: admins.map((a): SchoolAdminDto => ({ ...a, lastLoginAt: iso(a.lastLoginAt) })),
      subscriptions: row.subscriptions.map(subDto),
    };
  }

  getSchool(id: string): Promise<SchoolDetail> {
    return withBypass(this.prisma, (tx) => this.detail(tx, id));
  }

  async createSchool(input: CreateSchoolInput, actorId: string): Promise<SchoolDetail> {
    // Hash before opening the transaction: argon2 is slow and must not hold a DB connection.
    const passwordHash = await hashPassword(input.admin.password);
    return withBypass(this.prisma, async (tx) => {
      if (await tx.school.findUnique({ where: { code: input.code } })) throw conflict('A school with this code already exists', { field: 'code' });
      if (await tx.user.findUnique({ where: { email: input.admin.email } })) throw conflict('This email is already used by another account', { field: 'admin.email' });
      const plan = await tx.subscriptionPlan.findUnique({ where: { id: input.planId } });
      if (!plan || !plan.isActive) throw badRequest('Selected plan does not exist or is not active');
      const role = await tx.role.findFirst({ where: { schoolId: null, key: 'school_admin' } });
      if (!role) throw badRequest('Role "school_admin" is missing. Run: pnpm db:seed');

      const school = await tx.school.create({
        data: {
          name: input.name, code: input.code, email: input.email ?? null, phone: input.phone ?? null,
          address: input.address ?? null, city: input.city ?? null, timezone: input.timezone,
        },
      });
      await tx.subscription.create({
        data: { schoolId: school.id, planId: plan.id, status: 'TRIAL', endsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000) },
      });
      const admin = await tx.user.create({
        data: {
          schoolId: school.id, roleId: role.id, email: input.admin.email, passwordHash,
          firstName: input.admin.firstName, lastName: input.admin.lastName,
        },
      });
      await this.audit(tx, actorId, 'platform.school.create', school.id, school.id, { code: school.code, planId: plan.id, adminId: admin.id });
      return this.detail(tx, school.id);
    });
  }

  updateSchool(id: string, input: UpdateSchoolInput, actorId: string): Promise<SchoolDetail> {
    return withBypass(this.prisma, async (tx) => {
      const exists = await tx.school.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
      if (!exists) throw notFound('School not found');
      await tx.school.update({ where: { id }, data: input });
      await this.audit(tx, actorId, 'platform.school.update', id, id, { fields: Object.keys(input) });
      return this.detail(tx, id);
    });
  }

  setSchoolStatus(id: string, status: SchoolStatus, actorId: string): Promise<SchoolDetail> {
    return withBypass(this.prisma, async (tx) => {
      const exists = await tx.school.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
      if (!exists) throw notFound('School not found');
      await tx.school.update({ where: { id }, data: { status } });
      if (status === 'SUSPENDED') {
        // End every open session of the school's users now. (Access tokens already issued still work until they expire, <= 15 min.)
        await tx.refreshToken.updateMany({ where: { revokedAt: null, user: { schoolId: id } }, data: { revokedAt: new Date() } });
      }
      await this.audit(tx, actorId, status === 'SUSPENDED' ? 'platform.school.suspend' : 'platform.school.activate', id, id);
      return this.detail(tx, id);
    });
  }

  setSubscription(schoolId: string, input: SubscriptionInput, actorId: string): Promise<SchoolDetail> {
    return withBypass(this.prisma, async (tx) => {
      const exists = await tx.school.findFirst({ where: { id: schoolId, deletedAt: null }, select: { id: true } });
      if (!exists) throw notFound('School not found');
      const plan = await tx.subscriptionPlan.findUnique({ where: { id: input.planId } });
      if (!plan) throw badRequest('Selected plan does not exist');
      const endsAt = parseEndsAt(input.endsAt);
      // History is kept: close the live subscription(s) and add a new row, so past plans stay visible.
      await tx.subscription.updateMany({
        where: { schoolId, status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } },
        data: { status: 'CANCELLED', endsAt: new Date() },
      });
      const sub = await tx.subscription.create({ data: { schoolId, planId: plan.id, status: input.status, endsAt } });
      await this.audit(tx, actorId, 'platform.school.subscription', schoolId, sub.id, { planId: plan.id, status: input.status });
      return this.detail(tx, schoolId);
    });
  }

  // ---------------------------------------------------------------- plans
  listPlans(): Promise<PlanDto[]> {
    return withBypass(this.prisma, async (tx) => {
      const rows = await tx.subscriptionPlan.findMany({ orderBy: [{ priceMonthly: 'asc' }, { name: 'asc' }], include: { _count: { select: { subscriptions: true } } } });
      return rows.map(planDto);
    });
  }

  createPlan(input: PlanInput, actorId: string): Promise<PlanDto> {
    return withBypass(this.prisma, async (tx) => {
      if (await tx.subscriptionPlan.findUnique({ where: { name: input.name } })) throw conflict('A plan with this name already exists', { field: 'name' });
      const row = await tx.subscriptionPlan.create({
        data: { name: input.name, priceMonthly: input.priceMonthly, maxStudents: input.maxStudents ?? null, maxStaff: input.maxStaff ?? null, isActive: input.isActive },
        include: { _count: { select: { subscriptions: true } } },
      });
      await this.audit(tx, actorId, 'platform.plan.create', null, row.id, { name: row.name });
      return planDto(row);
    });
  }

  updatePlan(id: string, input: Partial<PlanInput>, actorId: string): Promise<PlanDto> {
    return withBypass(this.prisma, async (tx) => {
      const plan = await tx.subscriptionPlan.findUnique({ where: { id } });
      if (!plan) throw notFound('Plan not found');
      if (input.name && input.name !== plan.name && (await tx.subscriptionPlan.findUnique({ where: { name: input.name } }))) {
        throw conflict('A plan with this name already exists', { field: 'name' });
      }
      const row = await tx.subscriptionPlan.update({ where: { id }, data: input, include: { _count: { select: { subscriptions: true } } } });
      await this.audit(tx, actorId, 'platform.plan.update', null, id, { fields: Object.keys(input) });
      return planDto(row);
    });
  }

  // ---------------------------------------------------------------- analytics + logs
  analytics(): Promise<PlatformAnalytics> {
    return withBypass(this.prisma, async (tx) => {
      const since = new Date(Date.now() - 7 * 86_400_000);
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
      const [schools, schoolUsers, platformAdmins, logins7d, failedLogins7d] = await Promise.all([
        tx.school.findMany({ where: { deletedAt: null }, select: { status: true, createdAt: true, subscriptions: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } } } }),
        tx.user.count({ where: { schoolId: { not: null }, deletedAt: null } }),
        tx.user.count({ where: { schoolId: null, deletedAt: null } }),
        tx.auditLog.count({ where: { action: 'auth.login', createdAt: { gte: since } } }),
        tx.auditLog.count({ where: { action: 'auth.login_failed', createdAt: { gte: since } } }),
      ]);
      const subscriptions: PlatformAnalytics['subscriptions'] = { TRIAL: 0, ACTIVE: 0, PAST_DUE: 0, CANCELLED: 0, EXPIRED: 0, NONE: 0 };
      const byMonth = new Map<string, number>();
      for (let i = 0; i < 6; i++) {
        const d = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + i, 1));
        byMonth.set(d.toISOString().slice(0, 7), 0);
      }
      for (const s of schools) {
        subscriptions[s.subscriptions[0]?.status ?? 'NONE'] += 1;
        const key = s.createdAt.toISOString().slice(0, 7);
        if (byMonth.has(key)) byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
      }
      const active = schools.filter((s) => s.status === 'ACTIVE').length;
      return {
        schools: { total: schools.length, active, suspended: schools.length - active },
        users: { schoolUsers, platformAdmins },
        subscriptions,
        newSchoolsByMonth: [...byMonth].map(([month, count]) => ({ month, count })),
        logins7d, failedLogins7d,
      };
    });
  }

  listAuditLogs(filter: { schoolId?: string; action?: string; limit: number }): Promise<AuditLogDto[]> {
    return withBypass(this.prisma, async (tx) => {
      const where: Prisma.AuditLogWhereInput = {};
      if (filter.schoolId) where.schoolId = filter.schoolId;
      if (filter.action) where.action = { startsWith: filter.action };
      const rows = await tx.auditLog.findMany({
        where, orderBy: { createdAt: 'desc' }, take: Math.min(filter.limit, 500),
        include: { user: { select: { id: true, email: true } }, school: { select: { id: true, name: true } } },
      });
      return rows.map((r) => ({ id: r.id, action: r.action, createdAt: r.createdAt.toISOString(), ip: r.ip, metadata: r.metadata, user: r.user, school: r.school }));
    });
  }

  // ---------------------------------------------------------------- platform administrators
  listPlatformAdmins(): Promise<PlatformAdminDto[]> {
    return withBypass(this.prisma, async (tx) => {
      const rows = await tx.user.findMany({ where: { schoolId: null, deletedAt: null }, orderBy: { createdAt: 'asc' } });
      return rows.map(adminDto);
    });
  }

  async createPlatformAdmin(input: CreatePlatformAdminInput, actorId: string): Promise<PlatformAdminDto> {
    const passwordHash = await hashPassword(input.password);
    return withBypass(this.prisma, async (tx) => {
      if (await tx.user.findUnique({ where: { email: input.email } })) throw conflict('This email is already used by another account', { field: 'email' });
      const role = await tx.role.findFirst({ where: { schoolId: null, key: 'super_admin' } });
      if (!role) throw badRequest('Role "super_admin" is missing. Run: pnpm db:seed');
      const user = await tx.user.create({
        data: { schoolId: null, roleId: role.id, email: input.email, passwordHash, firstName: input.firstName, lastName: input.lastName },
      });
      await this.audit(tx, actorId, 'platform.admin.create', null, user.id, { email: user.email });
      return adminDto(user);
    });
  }

  setPlatformAdminStatus(id: string, status: 'ACTIVE' | 'INACTIVE', actorId: string): Promise<PlatformAdminDto> {
    return withBypass(this.prisma, async (tx) => {
      const target = await tx.user.findFirst({ where: { id, schoolId: null, deletedAt: null } });
      if (!target) throw notFound('Administrator not found');
      if (status === 'INACTIVE') {
        if (id === actorId) throw badRequest('You cannot deactivate your own account');
        const otherActive = await tx.user.count({ where: { schoolId: null, deletedAt: null, status: 'ACTIVE', id: { not: id } } });
        if (otherActive === 0) throw badRequest('At least one active platform administrator is required');
      }
      const user = await tx.user.update({ where: { id }, data: { status } });
      if (status === 'INACTIVE') await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit(tx, actorId, status === 'INACTIVE' ? 'platform.admin.deactivate' : 'platform.admin.activate', null, id);
      return adminDto(user);
    });
  }
}
