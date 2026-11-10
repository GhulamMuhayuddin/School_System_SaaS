import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { badRequest, conflict, notFound } from '../../utils/errors';
import type { AcademicsApi, ClassDto, ClassSubjectsDto, SessionDto, SubjectDto } from './academics.types';

type Tx = Prisma.TransactionClient;
const dayText = (d: Date): string => d.toISOString().slice(0, 10);
const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);
const sessionDto = (r: { id: string; name: string; startDate: Date; endDate: Date; isCurrent: boolean }): SessionDto => ({
  id: r.id, name: r.name, startDate: dayText(r.startDate), endDate: dayText(r.endDate), isCurrent: r.isCurrent,
});

export class AcademicsService implements AcademicsApi {
  constructor(private readonly prisma: PrismaClient) {}

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: action.split('.')[1] ?? null, entityId, metadata } });
  }

  private async load(tx: Tx, schoolId: string, onlyClassId?: string): Promise<ClassDto[]> {
    const classes = await tx.schoolClass.findMany({
      where: { schoolId, ...(onlyClassId ? { id: onlyClassId } : {}) },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
      include: { sections: { orderBy: { name: 'asc' } } },
    });
    // Counts only students who are still enrolled.
    const bySection = await tx.student.groupBy({ by: ['classId', 'sectionId'], where: { schoolId, deletedAt: null, status: 'ACTIVE' }, _count: { _all: true } });
    const secCount = new Map<string, number>();
    const classCount = new Map<string, number>();
    for (const g of bySection) {
      classCount.set(g.classId, (classCount.get(g.classId) ?? 0) + g._count._all);
      if (g.sectionId) secCount.set(g.sectionId, g._count._all);
    }
    return classes.map((c) => ({
      id: c.id, name: c.name, level: c.level, studentCount: classCount.get(c.id) ?? 0,
      sections: c.sections.map((s) => ({ id: s.id, classId: s.classId, name: s.name, capacity: s.capacity, studentCount: secCount.get(s.id) ?? 0 })),
    }));
  }

  listClasses(schoolId: string): Promise<ClassDto[]> {
    return tenantTransaction(this.prisma, schoolId, (tx) => this.load(tx, schoolId));
  }

  createClass(schoolId: string, input: { name: string; level: number }, actorId: string): Promise<ClassDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      if (await tx.schoolClass.findFirst({ where: { schoolId, name: input.name } })) throw conflict('A class with this name already exists', { field: 'name' });
      const c = await tx.schoolClass.create({ data: { schoolId, name: input.name, level: input.level } });
      await this.audit(tx, schoolId, actorId, 'academic.class.create', c.id, { name: c.name });
      return (await this.load(tx, schoolId, c.id))[0];
    });
  }

  updateClass(schoolId: string, id: string, input: { name?: string; level?: number }, actorId: string): Promise<ClassDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const c = await tx.schoolClass.findFirst({ where: { id, schoolId } });
      if (!c) throw notFound('Class not found');
      if (input.name && input.name !== c.name && (await tx.schoolClass.findFirst({ where: { schoolId, name: input.name } }))) throw conflict('A class with this name already exists', { field: 'name' });
      await tx.schoolClass.update({ where: { id }, data: input });
      await this.audit(tx, schoolId, actorId, 'academic.class.update', id, { fields: Object.keys(input) });
      return (await this.load(tx, schoolId, id))[0];
    });
  }

  deleteClass(schoolId: string, id: string, actorId: string): Promise<void> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const c = await tx.schoolClass.findFirst({ where: { id, schoolId } });
      if (!c) throw notFound('Class not found');
      // Any student record (even withdrawn) keeps its class, so a class with history cannot be removed.
      if ((await tx.student.count({ where: { schoolId, classId: id } })) > 0) throw conflict('This class has students and cannot be deleted');
      await tx.schoolClass.delete({ where: { id } });
      await this.audit(tx, schoolId, actorId, 'academic.class.delete', id, { name: c.name });
    });
  }

  createSection(schoolId: string, classId: string, input: { name: string; capacity?: number | null }, actorId: string): Promise<ClassDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const c = await tx.schoolClass.findFirst({ where: { id: classId, schoolId } });
      if (!c) throw notFound('Class not found');
      if (await tx.section.findFirst({ where: { classId, name: input.name } })) throw conflict('This class already has a section with this name', { field: 'name' });
      const s = await tx.section.create({ data: { schoolId, classId, name: input.name, capacity: input.capacity ?? null } });
      await this.audit(tx, schoolId, actorId, 'academic.section.create', s.id, { class: c.name, name: s.name });
      return (await this.load(tx, schoolId, classId))[0];
    });
  }

  updateSection(schoolId: string, id: string, input: { name?: string; capacity?: number | null }, actorId: string): Promise<ClassDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const s = await tx.section.findFirst({ where: { id, schoolId } });
      if (!s) throw notFound('Section not found');
      if (input.name && input.name !== s.name && (await tx.section.findFirst({ where: { classId: s.classId, name: input.name } }))) throw conflict('This class already has a section with this name', { field: 'name' });
      await tx.section.update({ where: { id }, data: input });
      await this.audit(tx, schoolId, actorId, 'academic.section.update', id, { fields: Object.keys(input) });
      return (await this.load(tx, schoolId, s.classId))[0];
    });
  }

  deleteSection(schoolId: string, id: string, actorId: string): Promise<void> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const s = await tx.section.findFirst({ where: { id, schoolId } });
      if (!s) throw notFound('Section not found');
      if ((await tx.student.count({ where: { schoolId, sectionId: id, deletedAt: null } })) > 0) throw conflict('This section has students and cannot be deleted');
      await tx.section.delete({ where: { id } });
      await this.audit(tx, schoolId, actorId, 'academic.section.delete', id, { name: s.name });
    });
  }

  // ------------------------------------------------------------------ academic sessions

  listSessions(schoolId: string): Promise<SessionDto[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => (await tx.academicSession.findMany({ where: { schoolId }, orderBy: { startDate: 'desc' } })).map(sessionDto));
  }

  createSession(schoolId: string, input: { name: string; startDate: string; endDate: string; isCurrent?: boolean }, actorId: string): Promise<SessionDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      if (await tx.academicSession.findFirst({ where: { schoolId, name: input.name } })) throw conflict('A session with this name already exists', { field: 'name' });
      // The first session is always the current one; later ones only if asked.
      const makeCurrent = Boolean(input.isCurrent) || (await tx.academicSession.count({ where: { schoolId, isCurrent: true } })) === 0;
      if (makeCurrent) await tx.academicSession.updateMany({ where: { schoolId, isCurrent: true }, data: { isCurrent: false } });
      const created = await tx.academicSession.create({ data: { schoolId, name: input.name, startDate: toDate(input.startDate), endDate: toDate(input.endDate), isCurrent: makeCurrent } });
      await this.audit(tx, schoolId, actorId, 'academic.session.create', created.id, { name: created.name, isCurrent: makeCurrent });
      return sessionDto(created);
    });
  }

  updateSession(schoolId: string, id: string, input: { name?: string; startDate?: string; endDate?: string }, actorId: string): Promise<SessionDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const current = await tx.academicSession.findFirst({ where: { id, schoolId } });
      if (!current) throw notFound('Session not found');
      if (input.name && input.name !== current.name && (await tx.academicSession.findFirst({ where: { schoolId, name: input.name } }))) throw conflict('A session with this name already exists', { field: 'name' });
      const start = input.startDate ?? dayText(current.startDate);
      const end = input.endDate ?? dayText(current.endDate);
      if (end <= start) throw badRequest('End date must be after the start date');
      const updated = await tx.academicSession.update({
        where: { id },
        data: { ...(input.name ? { name: input.name } : {}), startDate: toDate(start), endDate: toDate(end) },
      });
      await this.audit(tx, schoolId, actorId, 'academic.session.update', id, { fields: Object.keys(input) });
      return sessionDto(updated);
    });
  }

  setCurrentSession(schoolId: string, id: string, actorId: string): Promise<SessionDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      if (!(await tx.academicSession.findFirst({ where: { id, schoolId } }))) throw notFound('Session not found');
      await tx.academicSession.updateMany({ where: { schoolId, isCurrent: true, NOT: { id } }, data: { isCurrent: false } });
      const updated = await tx.academicSession.update({ where: { id }, data: { isCurrent: true } });
      await this.audit(tx, schoolId, actorId, 'academic.session.current', id, { name: updated.name });
      return sessionDto(updated);
    });
  }

  deleteSession(schoolId: string, id: string, actorId: string): Promise<void> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const s = await tx.academicSession.findFirst({ where: { id, schoolId } });
      if (!s) throw notFound('Session not found');
      if (s.isCurrent) throw conflict('The current session cannot be deleted. Make another session current first.');
      const used = (await tx.teachingAssignment.count({ where: { sessionId: id } })) + (await tx.timetableEntry.count({ where: { sessionId: id } })) + (await tx.syllabusTopic.count({ where: { sessionId: id } }));
      if (used > 0) throw conflict('This session has teacher assignments, timetable lessons or syllabus topics and cannot be deleted');
      await tx.academicSession.delete({ where: { id } });
      await this.audit(tx, schoolId, actorId, 'academic.session.delete', id, { name: s.name });
    });
  }

  // ------------------------------------------------------------------ subjects

  private async subject(tx: Tx, schoolId: string, id: string): Promise<SubjectDto> {
    const r = await tx.subject.findFirst({ where: { id, schoolId }, include: { _count: { select: { classes: true } } } });
    if (!r) throw notFound('Subject not found');
    return { id: r.id, name: r.name, code: r.code, classCount: r._count.classes };
  }

  listSubjects(schoolId: string): Promise<SubjectDto[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const rows = await tx.subject.findMany({ where: { schoolId }, orderBy: { name: 'asc' }, include: { _count: { select: { classes: true } } } });
      return rows.map((r) => ({ id: r.id, name: r.name, code: r.code, classCount: r._count.classes }));
    });
  }

  createSubject(schoolId: string, input: { name: string; code?: string | null }, actorId: string): Promise<SubjectDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      if (await tx.subject.findFirst({ where: { schoolId, name: input.name } })) throw conflict('A subject with this name already exists', { field: 'name' });
      const created = await tx.subject.create({ data: { schoolId, name: input.name, code: input.code ?? null } });
      await this.audit(tx, schoolId, actorId, 'academic.subject.create', created.id, { name: created.name });
      return this.subject(tx, schoolId, created.id);
    });
  }

  updateSubject(schoolId: string, id: string, input: { name?: string; code?: string | null }, actorId: string): Promise<SubjectDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const s = await tx.subject.findFirst({ where: { id, schoolId } });
      if (!s) throw notFound('Subject not found');
      if (input.name && input.name !== s.name && (await tx.subject.findFirst({ where: { schoolId, name: input.name } }))) throw conflict('A subject with this name already exists', { field: 'name' });
      await tx.subject.update({ where: { id }, data: { ...(input.name ? { name: input.name } : {}), ...(input.code !== undefined ? { code: input.code } : {}) } });
      await this.audit(tx, schoolId, actorId, 'academic.subject.update', id, { fields: Object.keys(input) });
      return this.subject(tx, schoolId, id);
    });
  }

  deleteSubject(schoolId: string, id: string, actorId: string): Promise<void> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const s = await tx.subject.findFirst({ where: { id, schoolId } });
      if (!s) throw notFound('Subject not found');
      const used = (await tx.teachingAssignment.count({ where: { subjectId: id } })) + (await tx.timetableEntry.count({ where: { subjectId: id } })) + (await tx.syllabusTopic.count({ where: { subjectId: id } }));
      if (used > 0) throw conflict('This subject is used in teacher assignments, the timetable or a syllabus and cannot be deleted');
      await tx.subject.delete({ where: { id } }); // its class links are removed with it
      await this.audit(tx, schoolId, actorId, 'academic.subject.delete', id, { name: s.name });
    });
  }

  // ------------------------------------------------------------------ subjects of a class

  private async classSubjects(tx: Tx, schoolId: string, classId: string): Promise<ClassSubjectsDto> {
    const rows = await tx.classSubject.findMany({ where: { schoolId, classId }, include: { subject: { select: { id: true, name: true, code: true } } } });
    return { classId, subjects: rows.map((r) => r.subject).sort((a, b) => a.name.localeCompare(b.name)) };
  }

  getClassSubjects(schoolId: string, classId: string): Promise<ClassSubjectsDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      if (!(await tx.schoolClass.findFirst({ where: { id: classId, schoolId } }))) throw notFound('Class not found');
      return this.classSubjects(tx, schoolId, classId);
    });
  }

  /** Replaces the set of subjects of a class. A subject that is already used by a teacher assignment or timetable lesson of this class cannot be removed. */
  setClassSubjects(schoolId: string, classId: string, subjectIds: string[], actorId: string): Promise<ClassSubjectsDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const klass = await tx.schoolClass.findFirst({ where: { id: classId, schoolId } });
      if (!klass) throw notFound('Class not found');
      const wanted = [...new Set(subjectIds)];
      if ((await tx.subject.count({ where: { schoolId, id: { in: wanted } } })) !== wanted.length) throw badRequest('One or more subjects do not exist');

      const existing = await tx.classSubject.findMany({ where: { schoolId, classId }, select: { subjectId: true } });
      const have = new Set(existing.map((e) => e.subjectId));
      const toAdd = wanted.filter((id) => !have.has(id));
      const toRemove = [...have].filter((id) => !wanted.includes(id));

      if (toRemove.length > 0) {
        const inUse =
          (await tx.teachingAssignment.count({ where: { subjectId: { in: toRemove }, section: { classId } } })) +
          (await tx.timetableEntry.count({ where: { subjectId: { in: toRemove }, section: { classId } } })) +
          (await tx.syllabusTopic.count({ where: { subjectId: { in: toRemove }, classId } }));
        if (inUse > 0) throw conflict('A subject you removed is still used by a teacher assignment, the timetable or the syllabus of this class. Remove those first.');
        await tx.classSubject.deleteMany({ where: { schoolId, classId, subjectId: { in: toRemove } } });
      }
      if (toAdd.length > 0) await tx.classSubject.createMany({ data: toAdd.map((subjectId) => ({ schoolId, classId, subjectId })) });
      await this.audit(tx, schoolId, actorId, 'academic.class.subjects', classId, { class: klass.name, added: toAdd.length, removed: toRemove.length });
      return this.classSubjects(tx, schoolId, classId);
    });
  }
}
