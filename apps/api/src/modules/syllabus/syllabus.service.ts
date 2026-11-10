import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { badRequest, conflict, notFound } from '../../utils/errors';
import type {
  CreateTopicInput, Progress, SummaryDto, SyllabusApi, SyllabusDto, SyllabusFilter, TopicDto, TopicStatus, UpdateTopicInput,
} from './syllabus.types';

type Tx = Prisma.TransactionClient;
const dto = (t: { id: string; title: string; description: string | null; sortOrder: number; status: TopicStatus; completedAt: Date | null }): TopicDto => ({
  id: t.id, title: t.title, description: t.description, sortOrder: t.sortOrder, status: t.status, completedAt: t.completedAt ? t.completedAt.toISOString() : null,
});
const progressOf = (rows: { status: TopicStatus }[]): Progress => ({
  total: rows.length, completed: rows.filter((r) => r.status === 'COMPLETED').length, inProgress: rows.filter((r) => r.status === 'IN_PROGRESS').length,
});

/** Syllabus topics per class and subject for an academic session, with coverage progress. */
export class SyllabusService implements SyllabusApi {
  constructor(private readonly prisma: PrismaClient) {}

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: 'syllabus', entityId, metadata } });
  }

  private async session(tx: Tx, schoolId: string, sessionId?: string) {
    const s = sessionId
      ? await tx.academicSession.findFirst({ where: { id: sessionId, schoolId }, select: { id: true, name: true } })
      : await tx.academicSession.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true, name: true } });
    if (!s) throw sessionId ? notFound('Session not found') : badRequest('Set the current academic session first.');
    return s;
  }

  private async requireClass(tx: Tx, schoolId: string, classId: string): Promise<void> {
    if (!(await tx.schoolClass.findFirst({ where: { id: classId, schoolId }, select: { id: true } }))) throw notFound('Class not found');
  }

  private async requireTopic(tx: Tx, schoolId: string, id: string) {
    const t = await tx.syllabusTopic.findFirst({ where: { id, schoolId } });
    if (!t) throw notFound('Topic not found');
    return t;
  }

  private ordered(tx: Tx, t: { sessionId: string; classId: string; subjectId: string }) {
    return tx.syllabusTopic.findMany({ where: { sessionId: t.sessionId, classId: t.classId, subjectId: t.subjectId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] });
  }

  list(schoolId: string, filter: SyllabusFilter): Promise<SyllabusDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const session = await this.session(tx, schoolId, filter.sessionId);
      await this.requireClass(tx, schoolId, filter.classId);
      const subject = await tx.subject.findFirst({ where: { id: filter.subjectId, schoolId }, select: { id: true, name: true } });
      if (!subject) throw notFound('Subject not found');
      const rows = await this.ordered(tx, { sessionId: session.id, classId: filter.classId, subjectId: subject.id });
      return { session, classId: filter.classId, subject, topics: rows.map(dto), progress: progressOf(rows) };
    });
  }

  /** Progress of every subject taught in the class (subjects without topics show 0 of 0). */
  summary(schoolId: string, classId: string, sessionId?: string): Promise<SummaryDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const session = await this.session(tx, schoolId, sessionId);
      await this.requireClass(tx, schoolId, classId);
      const [links, topics] = await Promise.all([
        tx.classSubject.findMany({ where: { schoolId, classId }, include: { subject: { select: { id: true, name: true } } } }),
        tx.syllabusTopic.findMany({ where: { schoolId, sessionId: session.id, classId }, select: { subjectId: true, status: true } }),
      ]);
      const subjects = links
        .map((l) => ({ subject: l.subject, progress: progressOf(topics.filter((t) => t.subjectId === l.subject.id)) }))
        .sort((a, b) => a.subject.name.localeCompare(b.subject.name));
      return { session, classId, subjects };
    });
  }

  create(schoolId: string, input: CreateTopicInput, actorId: string): Promise<TopicDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const session = await this.session(tx, schoolId, input.sessionId);
      await this.requireClass(tx, schoolId, input.classId);
      if (!(await tx.classSubject.findFirst({ where: { schoolId, classId: input.classId, subjectId: input.subjectId }, select: { id: true } }))) {
        throw badRequest('This subject is not taught in that class. Add it under the class subjects first.');
      }
      const group = { sessionId: session.id, classId: input.classId, subjectId: input.subjectId };
      if (await tx.syllabusTopic.findFirst({ where: { ...group, title: input.title }, select: { id: true } })) throw conflict('This topic already exists for the subject.', { field: 'title' });
      const last = await tx.syllabusTopic.aggregate({ where: group, _max: { sortOrder: true } });
      const created = await tx.syllabusTopic.create({ data: { schoolId, ...group, title: input.title, description: input.description ?? null, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
      await this.audit(tx, schoolId, actorId, 'syllabus.topic.create', created.id, { title: created.title, classId: input.classId, subjectId: input.subjectId });
      return dto(created);
    });
  }

  update(schoolId: string, id: string, input: UpdateTopicInput, actorId: string): Promise<TopicDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const t = await this.requireTopic(tx, schoolId, id);
      if (input.title && input.title !== t.title && (await tx.syllabusTopic.findFirst({ where: { sessionId: t.sessionId, classId: t.classId, subjectId: t.subjectId, title: input.title }, select: { id: true } }))) {
        throw conflict('This topic already exists for the subject.', { field: 'title' });
      }
      const updated = await tx.syllabusTopic.update({ where: { id }, data: { ...(input.title ? { title: input.title } : {}), ...(input.description !== undefined ? { description: input.description } : {}) } });
      await this.audit(tx, schoolId, actorId, 'syllabus.topic.update', id, { fields: Object.keys(input) });
      return dto(updated);
    });
  }

  setStatus(schoolId: string, id: string, status: TopicStatus, actorId: string): Promise<TopicDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const t = await this.requireTopic(tx, schoolId, id);
      const updated = await tx.syllabusTopic.update({ where: { id }, data: { status, completedAt: status === 'COMPLETED' ? new Date() : null } });
      await this.audit(tx, schoolId, actorId, 'syllabus.topic.status', id, { from: t.status, to: status });
      return dto(updated);
    });
  }

  /** Swaps a topic with its neighbour and renumbers the whole group 1..n, so the order never gets duplicate numbers. */
  move(schoolId: string, id: string, direction: 'up' | 'down', actorId: string): Promise<TopicDto[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const t = await this.requireTopic(tx, schoolId, id);
      const rows = await this.ordered(tx, t);
      const from = rows.findIndex((r) => r.id === id);
      const to = direction === 'up' ? from - 1 : from + 1;
      if (to >= 0 && to < rows.length) [rows[from], rows[to]] = [rows[to], rows[from]];
      for (const [index, row] of rows.entries()) {
        if (row.sortOrder !== index + 1) await tx.syllabusTopic.update({ where: { id: row.id }, data: { sortOrder: index + 1 } });
        row.sortOrder = index + 1;
      }
      await this.audit(tx, schoolId, actorId, 'syllabus.topic.move', id, { direction });
      return rows.map(dto);
    });
  }

  remove(schoolId: string, id: string, actorId: string): Promise<void> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const t = await this.requireTopic(tx, schoolId, id);
      await tx.syllabusTopic.delete({ where: { id } });
      await this.audit(tx, schoolId, actorId, 'syllabus.topic.delete', id, { title: t.title });
    });
  }
}
