import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { audienceError, statusOf, type Audience, type Viewer } from './communication.logic';
import type { AnnouncementDto, AnnouncementInput, CommunicationApi, Priority, SentDto } from './communication.types';

type Tx = Prisma.TransactionClient;
const LIMIT = 200;
const dayText = (d: Date): string => d.toISOString().slice(0, 10);
const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);

const include = { class: { select: { name: true } }, reads: { select: { userId: true } } } as const;
type Row = Prisma.AnnouncementGetPayload<{ include: typeof include }>;

/** Announcements. The inbox query mirrors the pure rule `visibleTo`, so what a user sees is decided in the database, not trusted from the browser. */
export class CommunicationService implements CommunicationApi {
  constructor(private readonly prisma: PrismaClient, private readonly now: () => Date = () => new Date()) {}

  private today(): string { return dayText(this.now()); }

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string | null, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: 'communication', entityId, metadata } });
  }

  /** Staff record first (sees everything), then student login, then guardian login; any other login (for example the school admin) sees everything too. */
  private async viewer(tx: Tx, schoolId: string, userId: string): Promise<Viewer> {
    if (await tx.staff.findFirst({ where: { schoolId, userId, deletedAt: null }, select: { id: true } })) return { kind: 'STAFF', classIds: [] };
    const student = await tx.student.findFirst({ where: { schoolId, userId, deletedAt: null }, select: { classId: true } });
    if (student) return { kind: 'STUDENT', classIds: [student.classId] };
    if (await tx.guardian.findFirst({ where: { schoolId, userId }, select: { id: true } })) {
      const links = await tx.studentGuardian.findMany({ where: { schoolId, guardian: { userId }, student: { deletedAt: null } }, select: { student: { select: { classId: true } } } });
      return { kind: 'PARENT', classIds: [...new Set<string>(links.map((l: { student: { classId: string } }) => l.student.classId))] };
    }
    return { kind: 'STAFF', classIds: [] };
  }

  private visibleWhere(v: Viewer): Prisma.AnnouncementWhereInput {
    if (v.kind === 'STAFF') return {};
    return { OR: [{ audience: 'ALL' }, { audience: v.kind === 'PARENT' ? 'PARENTS' : 'STUDENTS' }, { audience: 'CLASS', classId: { in: v.classIds } }] };
  }

  private liveWhere(): Prisma.AnnouncementWhereInput {
    return { withdrawnAt: null, OR: [{ expiresOn: null }, { expiresOn: { gte: toDate(this.today()) } }] };
  }

  private async authors(tx: Tx, rows: { createdById: string | null }[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((r) => r.createdById).filter((v): v is string => v !== null))];
    const users = ids.length === 0 ? [] : await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`] as const));
  }

  private base(r: Row, who: Map<string, string>) {
    return {
      id: r.id, title: r.title, body: r.body, audience: r.audience as Audience, className: r.class ? r.class.name : null, priority: r.priority as Priority,
      publishedAt: r.publishedAt.toISOString(), expiresOn: r.expiresOn ? dayText(r.expiresOn) : null, author: r.createdById ? who.get(r.createdById) ?? null : null,
    };
  }

  private sent(r: Row, who: Map<string, string>): SentDto {
    const b = this.base(r, who);
    return { ...b, status: statusOf({ withdrawnAt: r.withdrawnAt ? r.withdrawnAt.toISOString() : null, expiresOn: b.expiresOn }, this.today()), readCount: r.reads.length };
  }

  inbox(schoolId: string, userId: string, unreadOnly: boolean): Promise<{ announcements: AnnouncementDto[]; unread: number }> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const v = await this.viewer(tx, schoolId, userId);
      const where: Prisma.AnnouncementWhereInput = { AND: [{ schoolId }, this.visibleWhere(v), this.liveWhere()] };
      const rows = await tx.announcement.findMany({ where, include, orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }], take: LIMIT });
      const who = await this.authors(tx, rows);
      const all = rows.map((r) => ({ ...this.base(r, who), read: r.reads.some((x) => x.userId === userId) }));
      const unread = await tx.announcement.count({ where: { AND: [where, { reads: { none: { userId } } }] } });
      return { announcements: unreadOnly ? all.filter((a) => !a.read) : all, unread };
    });
  }

  unreadCount(schoolId: string, userId: string): Promise<number> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const v = await this.viewer(tx, schoolId, userId);
      return tx.announcement.count({ where: { AND: [{ schoolId }, this.visibleWhere(v), this.liveWhere(), { reads: { none: { userId } } }] } });
    });
  }

  markRead(schoolId: string, userId: string, id: string): Promise<void> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const v = await this.viewer(tx, schoolId, userId);
      const a = await tx.announcement.findFirst({ where: { AND: [{ id, schoolId }, this.visibleWhere(v)] }, select: { id: true } });
      if (!a) throw notFound('Announcement not found');
      await tx.announcementRead.upsert({ where: { announcementId_userId: { announcementId: id, userId } }, update: {}, create: { schoolId, announcementId: id, userId } });
    });
  }

  markAllRead(schoolId: string, userId: string): Promise<number> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const v = await this.viewer(tx, schoolId, userId);
      const open = await tx.announcement.findMany({ where: { AND: [{ schoolId }, this.visibleWhere(v), this.liveWhere(), { reads: { none: { userId } } }] }, select: { id: true } });
      for (const a of open) await tx.announcementRead.upsert({ where: { announcementId_userId: { announcementId: a.id, userId } }, update: {}, create: { schoolId, announcementId: a.id, userId } });
      return open.length;
    });
  }

  create(schoolId: string, actorId: string, input: AnnouncementInput): Promise<SentDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const problem = audienceError(input.audience, input.classId);
      if (problem) throw badRequest(problem);
      if (input.classId) {
        const c = await tx.schoolClass.findFirst({ where: { id: input.classId, schoolId }, select: { id: true } });
        if (!c) throw notFound('Class not found');
      }
      if (input.expiresOn && input.expiresOn < this.today()) throw badRequest('The last day to show it cannot be in the past');
      const r = await tx.announcement.create({
        data: {
          schoolId, title: input.title.trim(), body: input.body.trim(), audience: input.audience, classId: input.classId ?? null, priority: input.priority ?? 'NORMAL',
          expiresOn: input.expiresOn ? toDate(input.expiresOn) : null, createdById: actorId, publishedAt: this.now(),
        },
        include,
      });
      await this.audit(tx, schoolId, actorId, 'communication.send', r.id, { title: r.title, audience: r.audience, classId: r.classId });
      return this.sent(r, await this.authors(tx, [r]));
    });
  }

  listSent(schoolId: string): Promise<{ announcements: SentDto[]; truncated: boolean }> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const rows = await tx.announcement.findMany({ where: { schoolId }, include, orderBy: [{ publishedAt: 'desc' }], take: LIMIT + 1 });
      const who = await this.authors(tx, rows);
      return { announcements: rows.slice(0, LIMIT).map((r) => this.sent(r, who)), truncated: rows.length > LIMIT };
    });
  }

  withdraw(schoolId: string, actorId: string, id: string): Promise<SentDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM announcements WHERE id = ${id}::uuid FOR UPDATE`;
      const r = await tx.announcement.findFirst({ where: { id, schoolId }, include });
      if (!r) throw notFound('Announcement not found');
      if (r.withdrawnAt !== null) throw conflict('This announcement is already withdrawn');
      const u = await tx.announcement.update({ where: { id }, data: { withdrawnAt: this.now() }, include });
      await this.audit(tx, schoolId, actorId, 'communication.withdraw', id, { title: r.title });
      return this.sent(u, await this.authors(tx, [u]));
    });
  }
}
