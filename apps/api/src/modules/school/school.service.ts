import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { hashPassword } from '../../utils/password';
import type {
  CreateUserInput, Letterhead, SchoolApi, SchoolAuditLogDto, SchoolOverview, SchoolProfile, SchoolUserDto, UpdateProfileInput,
  UpdateUserInput, UserStatus,
} from './school.types';

type Tx = Prisma.TransactionClient;
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const dateOnly = (d: Date): string => d.toISOString().slice(0, 10);

const userSelect = {
  id: true, email: true, firstName: true, lastName: true, phone: true, status: true, lastLoginAt: true, createdAt: true,
  role: { select: { id: true, key: true, name: true } },
} as const;
type UserRow = {
  id: string; email: string; firstName: string; lastName: string; phone: string | null; status: UserStatus;
  lastLoginAt: Date | null; createdAt: Date; role: { id: string; key: string; name: string };
};
const userDto = (u: UserRow): SchoolUserDto => ({ ...u, lastLoginAt: iso(u.lastLoginAt), createdAt: u.createdAt.toISOString() });

/**
 * All queries run inside tenantTransaction(prisma, schoolId, ...): Postgres Row Level Security then
 * only shows this school's rows (plus the shared system roles), even if a query is written wrongly.
 */
export class SchoolService implements SchoolApi {
  constructor(private readonly prisma: PrismaClient) {}

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string | null, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: action.split('.')[1] ?? null, entityId, metadata } });
  }

  async overview(schoolId: string): Promise<SchoolOverview> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const since = new Date(Date.now() - 7 * 86_400_000);
      const [school, subscription, session, users, classes, sections, subjects, byRole, logins7d, failed7d, recent] = await Promise.all([
        tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, code: true, status: true, city: true } }),
        tx.subscription.findFirst({ where: { schoolId }, orderBy: { createdAt: 'desc' }, include: { plan: { select: { name: true } } } }),
        tx.academicSession.findFirst({ where: { schoolId, isCurrent: true } }),
        tx.user.groupBy({ by: ['status'], where: { schoolId, deletedAt: null }, _count: { _all: true } }),
        tx.schoolClass.count({ where: { schoolId } }),
        tx.section.count({ where: { schoolId } }),
        tx.subject.count({ where: { schoolId } }),
        tx.user.groupBy({ by: ['roleId'], where: { schoolId, deletedAt: null }, _count: { _all: true } }),
        tx.auditLog.count({ where: { schoolId, action: 'auth.login', createdAt: { gte: since } } }),
        tx.auditLog.count({ where: { schoolId, action: 'auth.login_failed', createdAt: { gte: since } } }),
        tx.auditLog.findMany({ where: { schoolId }, orderBy: { createdAt: 'desc' }, take: 8, include: { user: { select: { id: true, email: true } } } }),
      ]);
      if (!school) throw notFound('School not found');
      const roles = await tx.role.findMany({ where: { id: { in: byRole.map((r) => r.roleId) } }, select: { id: true, key: true, name: true } });
      const roleById = new Map(roles.map((r) => [r.id, r]));
      const total = users.reduce((n, g) => n + g._count._all, 0);
      const active = users.find((g) => g.status === 'ACTIVE')?._count._all ?? 0;
      return {
        school,
        subscription: subscription ? { planName: subscription.plan.name, status: subscription.status, endsAt: iso(subscription.endsAt) } : null,
        currentSession: session ? { id: session.id, name: session.name, startDate: dateOnly(session.startDate), endDate: dateOnly(session.endDate) } : null,
        counts: { users: total, activeUsers: active, classes, sections, subjects },
        usersByRole: byRole
          .map((g) => ({ roleKey: roleById.get(g.roleId)?.key ?? 'unknown', roleName: roleById.get(g.roleId)?.name ?? 'Unknown', count: g._count._all }))
          .sort((a, b) => b.count - a.count),
        logins7d, failedLogins7d: failed7d,
        recentActivity: recent.map((r) => ({ id: r.id, action: r.action, createdAt: r.createdAt.toISOString(), ip: r.ip, metadata: r.metadata, user: r.user })),
      };
    });
  }

  letterhead(schoolId: string): Promise<Letterhead> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const s = await tx.school.findUnique({ where: { id: schoolId }, select: { name: true, address: true, city: true, phone: true, email: true } });
      if (!s) throw notFound('School not found');
      return s;
    });
  }

  getProfile(schoolId: string): Promise<SchoolProfile> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const s = await tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, code: true, email: true, phone: true, address: true, city: true, country: true, timezone: true } });
      if (!s) throw notFound('School not found');
      return s;
    });
  }

  updateProfile(schoolId: string, input: UpdateProfileInput, actorId: string): Promise<SchoolProfile> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const s = await tx.school.update({
        where: { id: schoolId }, data: input,
        select: { id: true, name: true, code: true, email: true, phone: true, address: true, city: true, country: true, timezone: true },
      });
      await this.audit(tx, schoolId, actorId, 'school.profile.update', schoolId, { fields: Object.keys(input) });
      return s;
    });
  }

  listUsers(schoolId: string, filter: { q?: string; roleId?: string; status?: UserStatus }): Promise<SchoolUserDto[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const where: Prisma.UserWhereInput = { schoolId, deletedAt: null };
      if (filter.status) where.status = filter.status;
      if (filter.roleId) where.roleId = filter.roleId;
      if (filter.q) {
        where.OR = [
          { firstName: { contains: filter.q, mode: 'insensitive' } }, { lastName: { contains: filter.q, mode: 'insensitive' } },
          { email: { contains: filter.q, mode: 'insensitive' } },
        ];
      }
      const rows = await tx.user.findMany({ where, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }], select: userSelect });
      return (rows as unknown as UserRow[]).map(userDto);
    });
  }

  /** A role a school may assign: a shared system role or this school's own role, never the platform Super Administrator. */
  private async assignableRole(tx: Tx, roleId: string) {
    const role = await tx.role.findFirst({ where: { id: roleId, key: { not: 'super_admin' } }, select: { id: true, key: true, name: true } });
    if (!role) throw badRequest('Selected role is not available');
    return role;
  }

  private async otherActiveAdmins(tx: Tx, schoolId: string, exceptUserId: string): Promise<number> {
    return tx.user.count({ where: { schoolId, deletedAt: null, status: 'ACTIVE', role: { key: 'school_admin' }, id: { not: exceptUserId } } });
  }

  async createUser(schoolId: string, input: CreateUserInput, actorId: string): Promise<SchoolUserDto> {
    const passwordHash = await hashPassword(input.password);
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const role = await this.assignableRole(tx, input.roleId);
      // RLS hides other schools' rows, so this only catches this school; the database unique index (email is global) still rejects the rest with a 409.
      if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) throw conflict('This email is already used by another account', { field: 'email' });
      const created = await tx.user.create({
        data: { schoolId, roleId: role.id, email: input.email, passwordHash, firstName: input.firstName, lastName: input.lastName, phone: input.phone ?? null },
        select: userSelect,
      });
      await this.audit(tx, schoolId, actorId, 'school.user.create', created.id, { email: created.email, role: role.key });
      return userDto(created as unknown as UserRow);
    });
  }

  updateUser(schoolId: string, userId: string, input: UpdateUserInput, actorId: string): Promise<SchoolUserDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const target = await tx.user.findFirst({ where: { id: userId, schoolId, deletedAt: null }, select: { id: true, roleId: true, role: { select: { key: true } } } });
      if (!target) throw notFound('User not found');
      let newRoleKey: string | undefined;
      if (input.roleId && input.roleId !== target.roleId) {
        if (userId === actorId) throw badRequest('You cannot change your own role');
        const role = await this.assignableRole(tx, input.roleId);
        newRoleKey = role.key;
        if (target.role.key === 'school_admin' && role.key !== 'school_admin' && (await this.otherActiveAdmins(tx, schoolId, userId)) === 0) {
          throw badRequest('At least one active school administrator is required');
        }
      }
      const updated = await tx.user.update({ where: { id: userId }, data: input, select: userSelect });
      if (newRoleKey) {
        // The role is read from the access token, so end the user's sessions: the new role applies at the next sign-in / refresh.
        await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await this.audit(tx, schoolId, actorId, 'school.user.update', userId, { fields: Object.keys(input), role: newRoleKey });
      return userDto(updated as unknown as UserRow);
    });
  }

  setUserStatus(schoolId: string, userId: string, status: 'ACTIVE' | 'INACTIVE', actorId: string): Promise<SchoolUserDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const target = await tx.user.findFirst({ where: { id: userId, schoolId, deletedAt: null }, select: { id: true, role: { select: { key: true } } } });
      if (!target) throw notFound('User not found');
      if (status === 'INACTIVE') {
        if (userId === actorId) throw badRequest('You cannot deactivate your own account');
        if (target.role.key === 'school_admin' && (await this.otherActiveAdmins(tx, schoolId, userId)) === 0) {
          throw badRequest('At least one active school administrator is required');
        }
      }
      const updated = await tx.user.update({
        where: { id: userId },
        data: status === 'ACTIVE' ? { status, failedLoginCount: 0, lockedUntil: null } : { status },
        select: userSelect,
      });
      if (status === 'INACTIVE') await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit(tx, schoolId, actorId, status === 'ACTIVE' ? 'school.user.activate' : 'school.user.deactivate', userId);
      return userDto(updated as unknown as UserRow);
    });
  }

  async createStaffAccount(schoolId: string, staffId: string, input: { email: string; password: string; roleId: string }, actorId: string): Promise<SchoolUserDto> {
    const passwordHash = await hashPassword(input.password);
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const staff = await tx.staff.findFirst({ where: { id: staffId, schoolId, deletedAt: null }, select: { id: true, firstName: true, lastName: true, phone: true, userId: true, status: true } });
      if (!staff) throw notFound('Staff member not found');
      if (staff.status !== 'ACTIVE') throw conflict('This staff member has left');
      if (staff.userId) throw conflict('This staff member already has an account');
      const role = await this.assignableRole(tx, input.roleId);
      // Parent and student logins are linked to guardians/students, not to employees.
      if (['parent', 'student'].includes(role.key)) throw badRequest('Selected role is not available for staff');
      if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) throw conflict('This email is already used by another account', { field: 'email' });
      const created = await tx.user.create({
        data: { schoolId, roleId: role.id, email: input.email, passwordHash, firstName: staff.firstName, lastName: staff.lastName, phone: staff.phone },
        select: userSelect,
      });
      await tx.staff.update({ where: { id: staffId }, data: { userId: created.id } });
      await this.audit(tx, schoolId, actorId, 'school.user.create', created.id, { email: created.email, role: role.key, staffId });
      return userDto(created as unknown as UserRow);
    });
  }

  /** Login for a student (role "student"): the portal then shows only this student's own data. */
  async createStudentAccount(schoolId: string, studentId: string, input: { email: string; password: string }, actorId: string): Promise<SchoolUserDto> {
    const passwordHash = await hashPassword(input.password);
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const student = await tx.student.findFirst({ where: { id: studentId, schoolId, deletedAt: null }, select: { id: true, firstName: true, lastName: true, phone: true, userId: true, status: true } });
      if (!student) throw notFound('Student not found');
      if (student.status !== 'ACTIVE') throw conflict('Only an enrolled student can get a login');
      if (student.userId) throw conflict('This student already has an account');
      const role = await tx.role.findFirst({ where: { schoolId: null, key: 'student' }, select: { id: true } });
      if (!role) throw badRequest('Role "student" is missing. Run: pnpm db:seed');
      if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) throw conflict('This email is already used by another account', { field: 'email' });
      const created = await tx.user.create({
        data: { schoolId, roleId: role.id, email: input.email, passwordHash, firstName: student.firstName, lastName: student.lastName, phone: student.phone },
        select: userSelect,
      });
      await tx.student.update({ where: { id: studentId }, data: { userId: created.id } });
      await this.audit(tx, schoolId, actorId, 'school.user.create', created.id, { email: created.email, role: 'student', studentId });
      return userDto(created as unknown as UserRow);
    });
  }

  async createGuardianAccount(schoolId: string, guardianId: string, input: { email: string; password: string }, actorId: string): Promise<SchoolUserDto> {
    const passwordHash = await hashPassword(input.password);
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const guardian = await tx.guardian.findFirst({ where: { id: guardianId, schoolId }, select: { id: true, name: true, phone: true, userId: true } });
      if (!guardian) throw notFound('Guardian not found');
      if (guardian.userId) throw conflict('This guardian already has an account');
      const role = await tx.role.findFirst({ where: { schoolId: null, key: 'parent' }, select: { id: true } });
      if (!role) throw badRequest('Role "parent" is missing. Run: pnpm db:seed');
      if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) throw conflict('This email is already used by another account', { field: 'email' });
      const [firstName, ...rest] = guardian.name.trim().split(/\s+/);
      const created = await tx.user.create({
        data: { schoolId, roleId: role.id, email: input.email, passwordHash, firstName: firstName || guardian.name, lastName: rest.join(' ') || '-', phone: guardian.phone },
        select: userSelect,
      });
      await tx.guardian.update({ where: { id: guardianId }, data: { userId: created.id } });
      await this.audit(tx, schoolId, actorId, 'school.user.create', created.id, { email: created.email, role: 'parent', guardianId });
      return userDto(created as unknown as UserRow);
    });
  }

  listAuditLogs(schoolId: string, filter: { action?: string; userId?: string; limit: number }): Promise<SchoolAuditLogDto[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const where: Prisma.AuditLogWhereInput = { schoolId };
      if (filter.action) where.action = { startsWith: filter.action };
      if (filter.userId) where.userId = filter.userId;
      const rows = await tx.auditLog.findMany({
        where, orderBy: { createdAt: 'desc' }, take: Math.min(filter.limit, 500), include: { user: { select: { id: true, email: true } } },
      });
      return rows.map((r) => ({ id: r.id, action: r.action, createdAt: r.createdAt.toISOString(), ip: r.ip, metadata: r.metadata, user: r.user }));
    });
  }
}
