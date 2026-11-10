import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { badRequest, conflict, notFound } from '../../utils/errors';
import type {
  AssignmentDto, AssignmentFilter, AssignmentInput, EntryInput, PeriodDto, PeriodInput, SectionEntryDto, SectionRef, SectionTimetable,
  SessionRef, TeacherOption, TeacherTimetable, TimetableApi,
} from './timetable.types';

type Tx = Prisma.TransactionClient;

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const fullName = (p: { firstName: string; lastName: string }): string => `${p.firstName} ${p.lastName}`;
const periodDto = (p: { id: string; name: string; startTime: string; endTime: string; sortOrder: number; isBreak: boolean }): PeriodDto => ({
  id: p.id, name: p.name, startTime: p.startTime, endTime: p.endTime, sortOrder: p.sortOrder, isBreak: p.isBreak,
});
const sectionRef = (s: { id: string; name: string; classId: string; class: { name: string } }): SectionRef => ({ id: s.id, name: s.name, classId: s.classId, className: s.class.name });

const periodSelect = { id: true, name: true, startTime: true, endTime: true, sortOrder: true, isBreak: true } as const;
const entryInclude = {
  period: { select: periodSelect },
  subject: { select: { id: true, name: true } },
  staff: { select: { id: true, firstName: true, lastName: true } },
} as const;

/** Periods, teacher assignments and the weekly timetable. Every query runs under Row Level Security. */
export class TimetableService implements TimetableApi {
  constructor(private readonly prisma: PrismaClient) {}

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: action.split('.')[1] ?? null, entityId, metadata } });
  }

  /** The given session, or the current one. */
  private async session(tx: Tx, schoolId: string, sessionId?: string): Promise<SessionRef> {
    const s = sessionId
      ? await tx.academicSession.findFirst({ where: { id: sessionId, schoolId }, select: { id: true, name: true } })
      : await tx.academicSession.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true, name: true } });
    if (!s) throw sessionId ? notFound('Session not found') : badRequest('Set the current academic session first.');
    return s;
  }

  private async section(tx: Tx, schoolId: string, id: string) {
    const s = await tx.section.findFirst({ where: { id, schoolId }, select: { id: true, name: true, classId: true, class: { select: { name: true } } } });
    if (!s) throw notFound('Section not found');
    return s;
  }

  private async requireClassSubject(tx: Tx, schoolId: string, classId: string, subjectId: string): Promise<void> {
    if (!(await tx.classSubject.findFirst({ where: { schoolId, classId, subjectId }, select: { id: true } }))) {
      throw badRequest('This subject is not taught in that class. Add it under the class subjects first.');
    }
  }

  // ------------------------------------------------------------------ periods

  private async checkNoOverlap(tx: Tx, schoolId: string, start: string, end: string, ignoreId?: string): Promise<void> {
    const clash = await tx.period.findFirst({
      where: { schoolId, startTime: { lt: end }, endTime: { gt: start }, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
      select: { name: true },
    });
    if (clash) throw conflict(`This time overlaps "${clash.name}".`);
  }

  listPeriods(schoolId: string): Promise<PeriodDto[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) =>
      (await tx.period.findMany({ where: { schoolId }, orderBy: [{ startTime: 'asc' }, { name: 'asc' }] })).map(periodDto));
  }

  createPeriod(schoolId: string, input: PeriodInput, actorId: string): Promise<PeriodDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      if (await tx.period.findFirst({ where: { schoolId, name: input.name } })) throw conflict('A period with this name already exists', { field: 'name' });
      await this.checkNoOverlap(tx, schoolId, input.startTime, input.endTime);
      const sortOrder = (await tx.period.count({ where: { schoolId } })) + 1;
      const p = await tx.period.create({ data: { schoolId, name: input.name, startTime: input.startTime, endTime: input.endTime, isBreak: Boolean(input.isBreak), sortOrder } });
      await this.audit(tx, schoolId, actorId, 'timetable.period.create', p.id, { name: p.name });
      return periodDto(p);
    });
  }

  updatePeriod(schoolId: string, id: string, input: Partial<PeriodInput>, actorId: string): Promise<PeriodDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const p = await tx.period.findFirst({ where: { id, schoolId } });
      if (!p) throw notFound('Period not found');
      if (input.name && input.name !== p.name && (await tx.period.findFirst({ where: { schoolId, name: input.name } }))) throw conflict('A period with this name already exists', { field: 'name' });
      const start = input.startTime ?? p.startTime;
      const end = input.endTime ?? p.endTime;
      if (end <= start) throw badRequest('End time must be after the start time');
      await this.checkNoOverlap(tx, schoolId, start, end, id);
      if (input.isBreak === true && (await tx.timetableEntry.count({ where: { periodId: id } })) > 0) {
        throw conflict('Lessons are already placed in this period, so it cannot become a break.');
      }
      const updated = await tx.period.update({
        where: { id },
        data: { ...(input.name ? { name: input.name } : {}), startTime: start, endTime: end, ...(input.isBreak !== undefined ? { isBreak: input.isBreak } : {}) },
      });
      await this.audit(tx, schoolId, actorId, 'timetable.period.update', id, { fields: Object.keys(input) });
      return periodDto(updated);
    });
  }

  deletePeriod(schoolId: string, id: string, actorId: string): Promise<void> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const p = await tx.period.findFirst({ where: { id, schoolId } });
      if (!p) throw notFound('Period not found');
      if ((await tx.timetableEntry.count({ where: { periodId: id } })) > 0) throw conflict('Lessons are placed in this period. Remove them first.');
      await tx.period.delete({ where: { id } });
      await this.audit(tx, schoolId, actorId, 'timetable.period.delete', id, { name: p.name });
    });
  }

  // ------------------------------------------------------------------ teacher assignments

  private assignmentInclude = {
    staff: { select: { id: true, firstName: true, lastName: true } },
    subject: { select: { id: true, name: true } },
    section: { select: { id: true, name: true, classId: true, class: { select: { name: true } } } },
  } as const;

  private toAssignment(a: {
    id: string; sessionId: string; staff: { id: string; firstName: string; lastName: string }; subject: { id: string; name: string };
    section: { id: string; name: string; classId: string; class: { name: string } };
  }): AssignmentDto {
    return { id: a.id, sessionId: a.sessionId, staff: { id: a.staff.id, name: fullName(a.staff) }, subject: a.subject, section: sectionRef(a.section) };
  }

  listAssignments(schoolId: string, filter: AssignmentFilter): Promise<AssignmentDto[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const session = await this.session(tx, schoolId, filter.sessionId);
      const rows = await tx.teachingAssignment.findMany({
        where: { schoolId, sessionId: session.id, ...(filter.staffId ? { staffId: filter.staffId } : {}), ...(filter.sectionId ? { sectionId: filter.sectionId } : {}) },
        include: this.assignmentInclude,
      });
      return rows
        .map((r) => this.toAssignment(r))
        .sort((a, b) => a.section.className.localeCompare(b.section.className) || a.section.name.localeCompare(b.section.name) || a.subject.name.localeCompare(b.subject.name));
    });
  }

  /** Sets (or changes) the teacher of a subject in a section. The timetable lessons of that subject follow the new teacher. */
  assign(schoolId: string, input: AssignmentInput, actorId: string): Promise<AssignmentDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const session = await this.session(tx, schoolId, input.sessionId);
      const section = await this.section(tx, schoolId, input.sectionId);
      await this.requireClassSubject(tx, schoolId, section.classId, input.subjectId);

      const teacher = await tx.staff.findFirst({ where: { id: input.staffId, schoolId, deletedAt: null }, select: { id: true, firstName: true, lastName: true, status: true, category: true } });
      if (!teacher) throw notFound('Staff member not found');
      if (teacher.category !== 'TEACHING') throw badRequest('Only teaching staff can be assigned to a subject.');
      if (teacher.status !== 'ACTIVE') throw badRequest('This staff member has left the school.');

      // The new teacher must be free at every slot where this section already has this subject.
      const slots = await tx.timetableEntry.findMany({ where: { sessionId: session.id, sectionId: section.id, subjectId: input.subjectId }, include: { period: { select: { name: true } } } });
      for (const slot of slots) {
        const busy = await tx.timetableEntry.findFirst({ where: { sessionId: session.id, staffId: teacher.id, dayOfWeek: slot.dayOfWeek, periodId: slot.periodId, NOT: { id: slot.id } } });
        if (busy) throw conflict(`${fullName(teacher)} already has a lesson on ${DAYS[slot.dayOfWeek]} (${slot.period.name}).`);
      }

      const existing = await tx.teachingAssignment.findFirst({ where: { sessionId: session.id, sectionId: section.id, subjectId: input.subjectId } });
      const saved = existing
        ? await tx.teachingAssignment.update({ where: { id: existing.id }, data: { staffId: teacher.id }, include: this.assignmentInclude })
        : await tx.teachingAssignment.create({ data: { schoolId, sessionId: session.id, sectionId: section.id, subjectId: input.subjectId, staffId: teacher.id }, include: this.assignmentInclude });
      await tx.timetableEntry.updateMany({ where: { sessionId: session.id, sectionId: section.id, subjectId: input.subjectId }, data: { staffId: teacher.id } });
      await this.audit(tx, schoolId, actorId, 'timetable.assignment.set', saved.id, { staffId: teacher.id, sectionId: section.id, subjectId: input.subjectId, changed: Boolean(existing) });
      return this.toAssignment(saved);
    });
  }

  unassign(schoolId: string, id: string, actorId: string): Promise<void> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const a = await tx.teachingAssignment.findFirst({ where: { id, schoolId } });
      if (!a) throw notFound('Assignment not found');
      await tx.teachingAssignment.delete({ where: { id } });
      // Lessons stay in the timetable but have no teacher until a new one is assigned.
      await tx.timetableEntry.updateMany({ where: { sessionId: a.sessionId, sectionId: a.sectionId, subjectId: a.subjectId }, data: { staffId: null } });
      await this.audit(tx, schoolId, actorId, 'timetable.assignment.remove', id, { staffId: a.staffId, sectionId: a.sectionId, subjectId: a.subjectId });
    });
  }

  // ------------------------------------------------------------------ timetable

  private async orderedPeriods(tx: Tx, schoolId: string): Promise<PeriodDto[]> {
    return (await tx.period.findMany({ where: { schoolId }, orderBy: [{ startTime: 'asc' }, { name: 'asc' }] })).map(periodDto);
  }

  sectionTimetable(schoolId: string, sectionId: string, sessionId?: string): Promise<SectionTimetable> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const session = await this.session(tx, schoolId, sessionId);
      const section = await this.section(tx, schoolId, sectionId);
      const rows = await tx.timetableEntry.findMany({ where: { schoolId, sessionId: session.id, sectionId }, include: entryInclude });
      return {
        session,
        section: sectionRef(section),
        periods: await this.orderedPeriods(tx, schoolId),
        entries: rows.map((r) => ({
          id: r.id, sectionId: r.sectionId, dayOfWeek: r.dayOfWeek, period: periodDto(r.period), subject: r.subject,
          staff: r.staff ? { id: r.staff.id, name: fullName(r.staff) } : null, room: r.room,
        })),
      };
    });
  }

  listTeachers(schoolId: string): Promise<TeacherOption[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const rows = await tx.staff.findMany({
        where: { schoolId, deletedAt: null, status: 'ACTIVE', category: 'TEACHING' },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, employeeNo: true },
      });
      return rows.map((r) => ({ id: r.id, name: fullName(r), employeeNo: r.employeeNo }));
    });
  }

  async myTimetable(schoolId: string, userId: string, sessionId?: string): Promise<TeacherTimetable> {
    const me = await tenantTransaction(this.prisma, schoolId, (tx) => tx.staff.findFirst({ where: { schoolId, userId, deletedAt: null }, select: { id: true } }));
    if (!me) throw notFound('Your login is not linked to a staff profile, so there is no personal timetable.');
    return this.teacherTimetable(schoolId, me.id, sessionId);
  }

  teacherTimetable(schoolId: string, staffId: string, sessionId?: string): Promise<TeacherTimetable> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const session = await this.session(tx, schoolId, sessionId);
      const teacher = await tx.staff.findFirst({ where: { id: staffId, schoolId, deletedAt: null }, select: { id: true, firstName: true, lastName: true } });
      if (!teacher) throw notFound('Staff member not found');
      const rows = await tx.timetableEntry.findMany({
        where: { schoolId, sessionId: session.id, staffId },
        include: { ...entryInclude, section: { select: { id: true, name: true, classId: true, class: { select: { name: true } } } } },
      });
      return {
        session,
        staff: { id: teacher.id, name: fullName(teacher) },
        periods: await this.orderedPeriods(tx, schoolId),
        entries: rows.map((r) => ({
          id: r.id, dayOfWeek: r.dayOfWeek, period: periodDto(r.period), subject: r.subject, section: sectionRef(r.section),
          staff: r.staff ? { id: r.staff.id, name: fullName(r.staff) } : null, room: r.room,
        })),
      };
    });
  }

  /** Puts a lesson into one cell of a section's timetable (replacing what was there). The teacher comes from the assignment. */
  setEntry(schoolId: string, input: EntryInput, actorId: string): Promise<SectionEntryDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const session = await this.session(tx, schoolId, input.sessionId);
      const section = await this.section(tx, schoolId, input.sectionId);
      const period = await tx.period.findFirst({ where: { id: input.periodId, schoolId } });
      if (!period) throw notFound('Period not found');
      if (period.isBreak) throw badRequest('No lesson can be placed in a break.');
      await this.requireClassSubject(tx, schoolId, section.classId, input.subjectId);

      const assignment = await tx.teachingAssignment.findFirst({ where: { sessionId: session.id, sectionId: section.id, subjectId: input.subjectId } });
      const staffId = assignment?.staffId ?? null;
      if (staffId) {
        const busy = await tx.timetableEntry.findFirst({
          where: { sessionId: session.id, staffId, dayOfWeek: input.dayOfWeek, periodId: period.id, NOT: { sectionId: section.id } },
          include: { section: { select: { name: true, class: { select: { name: true } } } } },
        });
        if (busy) throw conflict(`This teacher already teaches ${busy.section.class.name}-${busy.section.name} on ${DAYS[input.dayOfWeek]} (${period.name}).`);
      }

      const saved = await tx.timetableEntry.upsert({
        where: { sessionId_sectionId_dayOfWeek_periodId: { sessionId: session.id, sectionId: section.id, dayOfWeek: input.dayOfWeek, periodId: period.id } },
        create: { schoolId, sessionId: session.id, sectionId: section.id, dayOfWeek: input.dayOfWeek, periodId: period.id, subjectId: input.subjectId, staffId, room: input.room ?? null },
        update: { subjectId: input.subjectId, staffId, room: input.room ?? null },
        include: entryInclude,
      });
      await this.audit(tx, schoolId, actorId, 'timetable.entry.set', saved.id, { sectionId: section.id, dayOfWeek: input.dayOfWeek, periodId: period.id, subjectId: input.subjectId });
      return {
        id: saved.id, sectionId: saved.sectionId, dayOfWeek: saved.dayOfWeek, period: periodDto(saved.period), subject: saved.subject,
        staff: saved.staff ? { id: saved.staff.id, name: fullName(saved.staff) } : null, room: saved.room,
      };
    });
  }

  deleteEntry(schoolId: string, id: string, actorId: string): Promise<void> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const e = await tx.timetableEntry.findFirst({ where: { id, schoolId } });
      if (!e) throw notFound('Lesson not found');
      await tx.timetableEntry.delete({ where: { id } });
      await this.audit(tx, schoolId, actorId, 'timetable.entry.remove', id, { sectionId: e.sectionId, dayOfWeek: e.dayOfWeek, periodId: e.periodId });
    });
  }
}
