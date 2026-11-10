import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import { forSchool, withBypass } from '../../db/tenant';
import { AppError, unauthorized } from '../../utils/errors';
import { hashPassword, verifyPassword } from '../../utils/password';
import type { AuthApi, LoginInput, PermissionLookup, RequestMeta, SessionResult, SessionUser } from './auth.types';
import { resetPasswordEmail, type EmailService } from './email';
import { hashToken, newOpaqueToken, type AccessTokenService, type AuthContext } from './tokens';

type UserWithRefs = Prisma.UserGetPayload<{ include: { role: true; school: true } }>;

export interface AuthServiceConfig {
  maxLoginAttempts: number;
  lockoutMinutes: number;
  sessionHours: number;
  sessionDaysRemember: number;
  resetTokenMinutes: number;
  appBaseUrl: string;
}

export interface AuthServiceDeps {
  prisma: PrismaClient;
  tokens: AccessTokenService;
  permissions: PermissionLookup;
  email: EmailService;
  logger: Logger;
  config: AuthServiceConfig;
  /** Injectable so tests can move time forward. */
  clock?: () => Date;
}

/**
 * When a refresh token that was just rotated is presented again within this window we assume two
 * browser tabs raced each other (not theft): the request is refused but the session family survives.
 */
const ROTATION_GRACE_MS = 10_000;

type LoginOutcome =
  | { kind: 'ok'; user: UserWithRefs; refreshToken: string; expiresAt: Date }
  | { kind: 'invalid' }
  | { kind: 'locked'; until: Date }
  | { kind: 'disabled' }
  | { kind: 'school_suspended' };

type RefreshOutcome =
  | { kind: 'ok'; user: UserWithRefs; refreshToken: string; expiresAt: Date }
  | { kind: 'rejected' };

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
const sessionExpired = () => unauthorized('Your session has ended. Please sign in again.');
const normalizeEmail = (email: string) => email.trim().toLowerCase();

export class AuthService implements AuthApi {
  private readonly prisma: PrismaClient;
  private readonly tokens: AccessTokenService;
  private readonly permissions: PermissionLookup;
  private readonly email: EmailService;
  private readonly logger: Logger;
  private readonly config: AuthServiceConfig;
  private readonly clock: () => Date;
  private dummyHash?: Promise<string>;

  constructor(deps: AuthServiceDeps) {
    this.prisma = deps.prisma;
    this.tokens = deps.tokens;
    this.permissions = deps.permissions;
    this.email = deps.email;
    this.logger = deps.logger;
    this.config = deps.config;
    this.clock = deps.clock ?? (() => new Date());
  }

  // ---------------------------------------------------------------- login

  async login(input: LoginInput, meta: RequestMeta): Promise<SessionResult> {
    const email = normalizeEmail(input.email);
    const now = this.clock();

    // Login looks users up across all schools, so it is one of the few places that uses withBypass().
    // The callback RETURNS outcomes instead of throwing so failed-attempt counters are committed.
    const outcome = await withBypass(this.prisma, async (tx): Promise<LoginOutcome> => {
      const user = await tx.user.findFirst({ where: { email, deletedAt: null }, include: { role: true, school: true } });

      if (!user) {
        // Spend the same time as a real check so response time does not reveal which emails exist.
        await verifyPassword(await this.getDummyHash(), input.password).catch(() => false);
        await this.audit(tx, meta, { action: 'auth.login_failed', metadata: { reason: 'unknown_user' } });
        return { kind: 'invalid' };
      }

      if (user.lockedUntil && user.lockedUntil > now) {
        await this.audit(tx, meta, { schoolId: user.schoolId, userId: user.id, action: 'auth.login_blocked', metadata: { reason: 'locked' } });
        return { kind: 'locked', until: user.lockedUntil };
      }

      const passwordOk = await verifyPassword(user.passwordHash, input.password).catch(() => false);
      if (!passwordOk) {
        const failures = user.failedLoginCount + 1;
        const lock = failures >= this.config.maxLoginAttempts;
        await tx.user.update({
          where: { id: user.id },
          data: lock
            ? { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + this.config.lockoutMinutes * 60_000) }
            : { failedLoginCount: failures },
        });
        await this.audit(tx, meta, {
          schoolId: user.schoolId,
          userId: user.id,
          action: lock ? 'auth.account_locked' : 'auth.login_failed',
          metadata: { failures },
        });
        return { kind: 'invalid' };
      }

      if (user.status !== 'ACTIVE') {
        await this.audit(tx, meta, { schoolId: user.schoolId, userId: user.id, action: 'auth.login_blocked', metadata: { reason: 'inactive' } });
        return { kind: 'disabled' };
      }
      if (user.school && this.isSchoolBlocked(user.school)) {
        await this.audit(tx, meta, { schoolId: user.schoolId, userId: user.id, action: 'auth.login_blocked', metadata: { reason: 'school_suspended' } });
        return { kind: 'school_suspended' };
      }

      const expiresAt = new Date(now.getTime() + (input.remember ? this.config.sessionDaysRemember * 24 : this.config.sessionHours) * 3_600_000);
      const token = await this.issueRefreshToken(tx, user.id, randomUUID(), expiresAt, meta);
      await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now } });
      await this.audit(tx, meta, { schoolId: user.schoolId, userId: user.id, action: 'auth.login', metadata: { remember: Boolean(input.remember) } });
      return { kind: 'ok', user, refreshToken: token.raw, expiresAt };
    });

    switch (outcome.kind) {
      case 'ok':
        return this.buildSession(outcome.user, outcome.refreshToken, outcome.expiresAt);
      case 'locked': {
        const retryAfterSeconds = Math.max(1, Math.ceil((outcome.until.getTime() - now.getTime()) / 1000));
        throw new AppError(423, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`, { retryAfterSeconds });
      }
      case 'disabled':
        throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is disabled. Please contact your school administrator.');
      case 'school_suspended':
        throw new AppError(403, 'SCHOOL_SUSPENDED', 'This school account is suspended. Please contact support.');
      default:
        throw invalidCredentials();
    }
  }

  // ---------------------------------------------------------------- refresh (rotation + reuse detection)

  async refresh(rawToken: string | undefined, meta: RequestMeta): Promise<SessionResult> {
    if (!rawToken) throw sessionExpired();
    const hash = hashToken(rawToken);
    const now = this.clock();

    const outcome = await withBypass(this.prisma, async (tx): Promise<RefreshOutcome> => {
      const row = await tx.refreshToken.findUnique({ where: { tokenHash: hash }, include: { user: { include: { role: true, school: true } } } });
      if (!row) return { kind: 'rejected' };
      const user = row.user;

      if (row.revokedAt) {
        const justRotated = row.replacedById !== null && now.getTime() - row.revokedAt.getTime() <= ROTATION_GRACE_MS;
        if (!justRotated) {
          // A token that was already used/revoked is being replayed: assume it was stolen and end the whole session family.
          await tx.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: now } });
          await this.audit(tx, meta, { schoolId: user.schoolId, userId: user.id, action: 'auth.refresh_reuse_detected', metadata: { familyId: row.familyId } });
        }
        return { kind: 'rejected' };
      }
      if (row.expiresAt <= now) return { kind: 'rejected' };

      if (user.deletedAt || user.status !== 'ACTIVE' || (user.school && this.isSchoolBlocked(user.school))) {
        await tx.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: now } });
        return { kind: 'rejected' };
      }

      // Claim the old token atomically; if another request already did, this one loses.
      const claimed = await tx.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: now } });
      if (claimed.count === 0) return { kind: 'rejected' };

      // The absolute session end stays the same through rotations.
      const next = await this.issueRefreshToken(tx, user.id, row.familyId, row.expiresAt, meta);
      await tx.refreshToken.update({ where: { tokenHash: hash }, data: { replacedById: next.id } });
      return { kind: 'ok', user, refreshToken: next.raw, expiresAt: row.expiresAt };
    });

    if (outcome.kind !== 'ok') throw sessionExpired();
    return this.buildSession(outcome.user, outcome.refreshToken, outcome.expiresAt);
  }

  // ---------------------------------------------------------------- logout

  async logout(rawToken: string | undefined, meta: RequestMeta): Promise<void> {
    if (!rawToken) return;
    const now = this.clock();
    await withBypass(this.prisma, async (tx) => {
      const row = await tx.refreshToken.findUnique({ where: { tokenHash: hashToken(rawToken) }, include: { user: true } });
      if (!row) return;
      await tx.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: now } });
      await this.audit(tx, meta, { schoolId: row.user.schoolId, userId: row.userId, action: 'auth.logout' });
    });
  }

  async logoutAll(userId: string, meta: RequestMeta): Promise<void> {
    const now = this.clock();
    await withBypass(this.prisma, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
      await this.audit(tx, meta, { schoolId: user?.schoolId ?? null, userId, action: 'auth.logout_all' });
    });
  }

  // ---------------------------------------------------------------- password reset

  /** Always completes quietly so the caller cannot learn whether an email is registered. */
  async forgotPassword(emailInput: string, meta: RequestMeta): Promise<void> {
    const email = normalizeEmail(emailInput);
    const now = this.clock();
    const rawToken = newOpaqueToken();

    const target = await withBypass(this.prisma, async (tx) => {
      const user = await tx.user.findFirst({ where: { email, deletedAt: null, status: 'ACTIVE' }, include: { school: true } });
      if (!user || (user.school && this.isSchoolBlocked(user.school))) {
        await this.audit(tx, meta, { action: 'auth.password_reset_requested', metadata: { known: false } });
        return null;
      }
      await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
      await tx.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(now.getTime() + this.config.resetTokenMinutes * 60_000) },
      });
      await this.audit(tx, meta, { schoolId: user.schoolId, userId: user.id, action: 'auth.password_reset_requested', metadata: { known: true } });
      return user.email;
    });

    if (!target) return;
    const link = `${this.config.appBaseUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}`;
    // Not awaited on purpose: sending takes time and a slower response would reveal that the account exists.
    void this.email.send(resetPasswordEmail(target, link, this.config.resetTokenMinutes)).catch((error: unknown) => {
      this.logger.error({ err: error }, 'Failed to send password reset email');
    });
  }

  async resetPassword(rawToken: string, newPassword: string, meta: RequestMeta): Promise<void> {
    const now = this.clock();
    const passwordHash = await hashPassword(newPassword);
    const ok = await withBypass(this.prisma, async (tx) => {
      const row = await tx.passwordResetToken.findUnique({ where: { tokenHash: hashToken(rawToken) }, include: { user: true } });
      if (!row || row.usedAt || row.expiresAt <= now || row.user.deletedAt || row.user.status !== 'ACTIVE') return false;
      const claimed = await tx.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
      if (claimed.count === 0) return false;
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash, failedLoginCount: 0, lockedUntil: null } });
      await tx.passwordResetToken.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: now } });
      await tx.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: now } });
      await this.audit(tx, meta, { schoolId: row.user.schoolId, userId: row.userId, action: 'auth.password_reset_completed' });
      return true;
    });
    if (!ok) throw new AppError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired. Please request a new one.');
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string, meta: RequestMeta): Promise<void> {
    const now = this.clock();
    const passwordHash = await hashPassword(newPassword);
    const result = await withBypass(this.prisma, async (tx): Promise<'ok' | 'wrong' | 'missing'> => {
      const user = await tx.user.findFirst({ where: { id: userId, deletedAt: null, status: 'ACTIVE' } });
      if (!user) return 'missing';
      if (!(await verifyPassword(user.passwordHash, currentPassword).catch(() => false))) {
        await this.audit(tx, meta, { schoolId: user.schoolId, userId, action: 'auth.password_change_failed' });
        return 'wrong';
      }
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      // Every session (including this one) ends; the user signs in again with the new password.
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
      await this.audit(tx, meta, { schoolId: user.schoolId, userId, action: 'auth.password_changed' });
      return 'ok';
    });
    if (result === 'missing') throw unauthorized();
    if (result === 'wrong') throw new AppError(400, 'CURRENT_PASSWORD_INCORRECT', 'Your current password is incorrect');
  }

  // ---------------------------------------------------------------- profile

  async getProfile(ctx: AuthContext): Promise<SessionUser> {
    const include = { role: true, school: true } as const;
    // School users are read through forSchool() (tenant isolation applies); platform users have no school.
    const user = ctx.schoolId
      ? await forSchool(this.prisma, ctx.schoolId).user.findFirst({ where: { id: ctx.userId, deletedAt: null }, include })
      : await withBypass(this.prisma, (tx) => tx.user.findFirst({ where: { id: ctx.userId, schoolId: null, deletedAt: null }, include }));
    if (!user || user.status !== 'ACTIVE' || (user.school && this.isSchoolBlocked(user.school))) throw unauthorized();
    return this.toSessionUser(user, await this.permissions.get(user.roleId));
  }

  // ---------------------------------------------------------------- helpers

  private isSchoolBlocked(school: { status: string; deletedAt: Date | null }): boolean {
    return school.status !== 'ACTIVE' || school.deletedAt !== null;
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hashPassword(randomUUID());
    return this.dummyHash;
  }

  private async issueRefreshToken(
    tx: Prisma.TransactionClient,
    userId: string,
    familyId: string,
    expiresAt: Date,
    meta: RequestMeta,
  ): Promise<{ raw: string; id: string }> {
    const raw = newOpaqueToken();
    const row = await tx.refreshToken.create({
      data: { userId, tokenHash: hashToken(raw), familyId, expiresAt, userAgent: meta.userAgent?.slice(0, 255), ip: meta.ip },
    });
    return { raw, id: row.id };
  }

  private async buildSession(user: UserWithRefs, refreshToken: string, expiresAt: Date): Promise<SessionResult> {
    const permissions = await this.permissions.get(user.roleId);
    const signed = await this.tokens.sign({ userId: user.id, schoolId: user.schoolId, roleId: user.roleId, roleKey: user.role.key });
    return {
      accessToken: signed.token,
      expiresInSeconds: signed.expiresInSeconds,
      refreshToken,
      refreshExpiresAt: expiresAt,
      user: this.toSessionUser(user, permissions),
    };
  }

  private toSessionUser(user: UserWithRefs, permissions: ReadonlySet<string>): SessionUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      preferredLang: user.preferredLang,
      role: { id: user.role.id, key: user.role.key, name: user.role.name },
      school: user.school ? { id: user.school.id, name: user.school.name, code: user.school.code } : null,
      permissions: [...permissions].sort(),
    };
  }

  private async audit(
    tx: Prisma.TransactionClient,
    meta: RequestMeta,
    entry: { schoolId?: string | null; userId?: string | null; action: string; metadata?: Prisma.InputJsonValue },
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        schoolId: entry.schoolId ?? null,
        userId: entry.userId ?? null,
        action: entry.action,
        entity: 'User',
        entityId: entry.userId ?? null,
        metadata: entry.metadata,
        ip: meta.ip,
      },
    });
  }
}
