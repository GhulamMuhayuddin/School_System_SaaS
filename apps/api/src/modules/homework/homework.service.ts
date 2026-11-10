import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { AppError, badRequest, notFound } from '../../utils/errors';
import { dateProblem, homeworkState, tally, validMarks, type SubmissionStatusKey } from './homework.logic';
import type { Caller, HomeworkApi, HomeworkDetail, HomeworkDto, HomeworkFilter, HomeworkInput, HomeworkPatch, RosterRow, SubmissionEntry } from './homework.types';

type Tx = Prisma.TransactionClient;
const LIST_LIMIT = 300;
const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);
const dayText = (d: Date): string => d.toISOString().slice(0, 10);
const fullName = (p: { firstName: string; lastName: string }): string => `${p.firstName} ${p.lastName}`;

const include = {
  subject: { select: { id: true, name: true } },
  section: { select: { id: true, name: true, class: { select: { id: true, name: true } } } },
} as const;
type Row = Prisma.HomeworkGetPayload<{ include: typeof include }>;

/** Homework per section and subject, and the teacher's record of who handed it in. Every query runs under Row Level Security. */
export class HomeworkService implements HomeworkApi {
  constructor(private readonly prisma: PrismaClient, private readonly now: () => Date = () => new Date()) {}

  private today(): string { return dayText(this.now()); }

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string | null, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: 'homework', entityId, metadata } });
  }

  /** academic.manage may work with any section; everyone else only with the sections and subjects they teach in that session. */
  private async mayEdit(tx: Tx, schoolId: string, caller: Caller, hw: { sessionId: string; sectionId: string; subjectId: string }): Promise<boolean> {
    if (caller.canManage) return true;
    const found = await tx.teachingAssignment.findFirst({
      where: { schoolId, sessionId: hw.sessionId, sectionId: hw.sectionId, subjectId: hw.subjectId, staff: { userId: caller.userId, deletedAt: null } }, select: { id: true },
    });
    return found !== null;
  }

  private async load(tx: Tx, schoolId: string, id: string): Promise<Row> {
    const hw = await tx.homework.findFirst({ where: { id, schoolId }, include });
    if (!hw) throw notFound('Homework not found');
    return hw;
  }

  private async dtos(tx: Tx, schoolId: string, rows: Row[]): Promise<HomeworkDto[]> {
    if (rows.length === 0) return [];
    const sections = [...new Set(rows.map((r) => r.sectionId))];
    const counts = await tx.student.groupBy({ by: ['sectionId'], where: { schoolId, sectionId: { in: sections }, status: 'ACTIVE', deletedAt: null }, _count: { _all: true } });
    const perSection = new Map(counts.map((c) => [c.sectionId, c._count._all]));
    const subs = await tx.homeworkSubmission.groupBy({ by: ['homeworkId', 'status'], where: { schoolId, homeworkId: { in: rows.map((r) => r.id) } }, _count: { _all: true } });
    const today = this.today();
    return rows.map((r) => {
      const statuses: SubmissionStatusKey[] = [];
      for (const s of subs) if (s.homeworkId === r.id) for (let i = 0; i < s._count._all; i++) statuses.push(s.status as SubmissionStatusKey);
      return {
        id: r.id, title: r.title, description: r.description, assignedDate: dayText(r.assignedDate), dueDate: dayText(r.dueDate), maxMarks: r.maxMarks,
        state: homeworkState(dayText(r.dueDate), today), class: r.section.class, section: { id: r.section.id, name: r.section.name }, subject: r.subject,
        counts: tally(perSection.get(r.sectionId) ?? 0, statuses),
      };
    });
  }

  private async detail(tx: Tx, schoolId: string, id: string, caller: Caller): Promise<HomeworkDetail> {
    const hw = await this.load(tx, schoolId, id);
    const [dto] = await this.dtos(tx, schoolId, [hw]);
    const students = await tx.student.findMany({
      where: { schoolId, sectionId: hw.sectionId, status: 'ACTIVE', deletedAt: null },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { admissionNo: 'asc' }], select: { id: true, admissionNo: true, firstName: true, lastName: true },
    });
    const subs = await tx.homeworkSubmission.findMany({ where: { schoolId, homeworkId: id, studentId: { in: students.map((s) => s.id) } } });
    const by = new Map(subs.map((s) => [s.studentId, s]));
    const roster: RosterRow[] = students.map((s) => {
      const sub = by.get(s.id);
      return { studentId: s.id, admissionNo: s.admissionNo, name: fullName(s), status: (sub?.status as SubmissionStatusKey | undefined) ?? null, marks: sub?.marks ?? null, remark: sub?.remark ?? null };
    });
    const canEdit = await this.mayEdit(tx, schoolId, caller, hw);
    return { ...(dto as HomeworkDto), roster, access: { canEdit, reason: canEdit ? null : 'NOT_YOUR_SUBJECT' } };
  }

  private forbid(): AppError { return new AppError(403, 'FORBIDDEN', 'You can only change homework of the subjects and sections you teach.'); }

  list(schoolId: string, f: HomeworkFilter, caller: Caller): Promise<HomeworkDto[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const rows = await tx.homework.findMany({
        where: {
          schoolId,
          ...(f.sectionId ? { sectionId: f.sectionId } : {}), ...(f.subjectId ? { subjectId: f.subjectId } : {}), ...(f.classId ? { section: { classId: f.classId } } : {}),
          ...(f.mine ? { createdById: caller.userId } : {}),
          ...(f.from || f.to ? { dueDate: { ...(f.from ? { gte: toDate(f.from) } : {}), ...(f.to ? { lte: toDate(f.to) } : {}) } } : {}),
        },
        include, orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }], take: LIST_LIMIT,
      });
      return this.dtos(tx, schoolId, rows);
    });
  }

  create(schoolId: string, caller: Caller, input: HomeworkInput): Promise<HomeworkDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const today = this.today();
      const assigned = input.assignedDate ?? today;
      const problem = dateProblem(assigned, input.dueDate, today);
      if (problem) throw badRequest(problem);
      const session = await tx.academicSession.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true } });
      if (!session) throw badRequest('Set a current academic session first (Academic setup)');
      const section = await tx.section.findFirst({ where: { id: input.sectionId, schoolId }, select: { id: true, classId: true } });
      if (!section) throw notFound('Section not found');
      if (!(await tx.subject.findFirst({ where: { id: input.subjectId, schoolId }, select: { id: true } }))) throw notFound('Subject not found');
      if (!(await tx.classSubject.findFirst({ where: { schoolId, classId: section.classId, subjectId: input.subjectId }, select: { id: true } }))) throw badRequest('This subject is not offered in this class');
      const target = { sessionId: session.id, sectionId: section.id, subjectId: input.subjectId };
      if (!(await this.mayEdit(tx, schoolId, caller, target))) throw this.forbid();
      const hw = await tx.homework.create({
        data: { schoolId, ...target, title: input.title, description: input.description ?? null, assignedDate: toDate(assigned), dueDate: toDate(input.dueDate), maxMarks: input.maxMarks ?? null, createdById: caller.userId },
      });
      await this.audit(tx, schoolId, caller.userId, 'homework.create', hw.id, { title: input.title, sectionId: section.id, subjectId: input.subjectId, dueDate: input.dueDate });
      return this.detail(tx, schoolId, hw.id, caller);
    });
  }

  get(schoolId: string, id: string, caller: Caller): Promise<HomeworkDetail> {
    return tenantTransaction(this.prisma, schoolId, (tx) => this.detail(tx, schoolId, id, caller));
  }

  update(schoolId: string, caller: Caller, id: string, patch: HomeworkPatch): Promise<HomeworkDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const hw = await this.load(tx, schoolId, id);
      if (!(await this.mayEdit(tx, schoolId, caller, hw))) throw this.forbid();
      const due = patch.dueDate ?? dayText(hw.dueDate);
      const problem = dateProblem(dayText(hw.assignedDate), due, dayText(hw.assignedDate)); // only the order and the one-year limit matter when editing
      if (problem) throw badRequest(problem);
      if (patch.maxMarks !== undefined) {
        const top = await tx.homeworkSubmission.aggregate({ where: { schoolId, homeworkId: id, marks: { not: null } }, _max: { marks: true } });
        const highest = top._max.marks;
        if (highest !== null && (patch.maxMarks === null || patch.maxMarks < highest)) throw badRequest(`Marks are already saved up to ${highest}; the maximum cannot be lower (or removed)`);
      }
      await tx.homework.update({
        where: { id },
        data: { title: patch.title, description: patch.description, dueDate: patch.dueDate ? toDate(patch.dueDate) : undefined, maxMarks: patch.maxMarks },
      });
      await this.audit(tx, schoolId, caller.userId, 'homework.update', id, { title: patch.title ?? null, dueDate: patch.dueDate ?? null });
      return this.detail(tx, schoolId, id, caller);
    });
  }

  remove(schoolId: string, caller: Caller, id: string): Promise<void> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const hw = await this.load(tx, schoolId, id);
      if (!(await this.mayEdit(tx, schoolId, caller, hw))) throw this.forbid();
      const checked = await tx.homeworkSubmission.count({ where: { schoolId, homeworkId: id } });
      await tx.homework.delete({ where: { id } });
      await this.audit(tx, schoolId, caller.userId, 'homework.delete', id, { title: hw.title, checked });
    });
  }

  saveSubmissions(schoolId: string, caller: Caller, id: string, entries: SubmissionEntry[]): Promise<HomeworkDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const hw = await this.load(tx, schoolId, id);
      if (!(await this.mayEdit(tx, schoolId, caller, hw))) throw this.forbid();
      const ids = entries.map((e) => e.studentId);
      if (new Set(ids).size !== ids.length) throw badRequest('A student appears twice in the list.');
      const roster = await tx.student.findMany({ where: { schoolId, sectionId: hw.sectionId, status: 'ACTIVE', deletedAt: null, id: { in: ids } }, select: { id: true } });
      if (roster.length !== ids.length) throw badRequest('Some students are not active students of this section.');
      for (const e of entries) {
        if (e.marks === null || e.marks === undefined) continue;
        if (e.status === null || e.status === 'MISSING') throw badRequest('Marks can only be given to a student who handed the work in.');
        if (hw.maxMarks === null) throw badRequest('This homework has no maximum marks, so marks cannot be saved.');
        if (!validMarks(e.marks, hw.maxMarks)) throw badRequest(`Marks must be between 0 and ${hw.maxMarks}.`);
      }
      let cleared = 0;
      for (const e of entries) {
        if (e.status === null) {
          cleared += (await tx.homeworkSubmission.deleteMany({ where: { schoolId, homeworkId: id, studentId: e.studentId } })).count;
          continue;
        }
        const data = { status: e.status, marks: e.status === 'MISSING' ? null : e.marks ?? null, remark: e.remark ?? null, checkedById: caller.userId, checkedAt: this.now() };
        await tx.homeworkSubmission.upsert({
          where: { homeworkId_studentId: { homeworkId: id, studentId: e.studentId } }, update: data, create: { schoolId, homeworkId: id, studentId: e.studentId, ...data },
        });
      }
      await this.audit(tx, schoolId, caller.userId, 'homework.submissions.save', id, { entries: entries.length, cleared });
      return this.detail(tx, schoolId, id, caller);
    });
  }
}
