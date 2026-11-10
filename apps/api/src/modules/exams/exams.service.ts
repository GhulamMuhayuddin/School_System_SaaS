import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { AppError, badRequest, conflict, notFound } from '../../utils/errors';
import { DEFAULT_BANDS, assignPositions, studentResult as buildStudentResult, summarize, validMark, validateBands } from './exams.logic';
import type {
  Caller, ClassResults, ExamDetail, ExamDto, ExamsApi, GradeBandDto, MarkAccess, MarkEntry, PaperDto, PaperInput, PaperMarks, StudentExamResult,
} from './exams.types';

type Tx = Prisma.TransactionClient;
const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);
const dayText = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const fullName = (p: { firstName: string; lastName: string }): string => `${p.firstName} ${p.lastName}`;
const optDate = (s: string | null | undefined): Date | null | undefined => (s === undefined ? undefined : s === null ? null : toDate(s));

type ExamRow = { id: string; sessionId: string; name: string; startDate: Date | null; endDate: Date | null; status: 'DRAFT' | 'PUBLISHED'; publishedAt: Date | null; session: { name: string }; _count: { papers: number } };
const examInclude = { session: { select: { name: true } }, _count: { select: { papers: true } } } as const;
const toExamDto = (e: ExamRow): ExamDto => ({
  id: e.id, sessionId: e.sessionId, sessionName: e.session.name, name: e.name, startDate: dayText(e.startDate), endDate: dayText(e.endDate),
  status: e.status, publishedAt: e.publishedAt ? e.publishedAt.toISOString() : null, paperCount: e._count.papers,
});

/** Examinations, marks and computed results. Every query runs under Row Level Security. */
export class ExamsService implements ExamsApi {
  constructor(private readonly prisma: PrismaClient, private readonly now: () => Date = () => new Date()) {}

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string | null, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: 'exam', entityId, metadata } });
  }

  private async bandsIn(tx: Tx, schoolId: string): Promise<{ bands: GradeBandDto[]; isDefault: boolean }> {
    const rows = await tx.gradeBand.findMany({ where: { schoolId }, orderBy: { minPercent: 'desc' } });
    if (rows.length === 0) return { bands: DEFAULT_BANDS, isDefault: true };
    return { bands: rows.map((r) => ({ grade: r.grade, minPercent: r.minPercent, remark: r.remark })), isDefault: false };
  }

  private async examRow(tx: Tx, schoolId: string, id: string): Promise<ExamRow> {
    const e = await tx.exam.findFirst({ where: { id, schoolId }, include: examInclude });
    if (!e) throw notFound('Exam not found');
    return e as ExamRow;
  }

  private async classStudentCounts(tx: Tx, schoolId: string, classIds: string[]): Promise<Map<string, number>> {
    const students = await tx.student.findMany({ where: { schoolId, classId: { in: classIds }, status: 'ACTIVE', deletedAt: null }, select: { classId: true } });
    const counts = new Map<string, number>();
    for (const s of students) counts.set(s.classId, (counts.get(s.classId) ?? 0) + 1);
    return counts;
  }

  private async paperDtos(tx: Tx, schoolId: string, examId: string): Promise<PaperDto[]> {
    const papers = await tx.examPaper.findMany({
      where: { schoolId, examId }, include: { class: { select: { name: true, level: true } }, subject: { select: { name: true } } },
    });
    const counts = await this.classStudentCounts(tx, schoolId, [...new Set(papers.map((p) => p.classId))]);
    const entered = await tx.examMark.findMany({ where: { schoolId, paperId: { in: papers.map((p) => p.id) } }, select: { paperId: true } });
    const enteredBy = new Map<string, number>();
    for (const m of entered) enteredBy.set(m.paperId, (enteredBy.get(m.paperId) ?? 0) + 1);
    return papers
      .sort((a, b) => a.class.level - b.class.level || a.class.name.localeCompare(b.class.name) || a.subject.name.localeCompare(b.subject.name))
      .map((p) => ({
        id: p.id, classId: p.classId, className: p.class.name, subjectId: p.subjectId, subjectName: p.subject.name,
        totalMarks: p.totalMarks, passMarks: p.passMarks, examDate: dayText(p.examDate), entered: enteredBy.get(p.id) ?? 0, students: counts.get(p.classId) ?? 0,
      }));
  }

  private async detail(tx: Tx, schoolId: string, examId: string): Promise<ExamDetail> {
    const exam = await this.examRow(tx, schoolId, examId);
    return { ...toExamDto(exam), papers: await this.paperDtos(tx, schoolId, examId) };
  }

  // ---- grading scale ------------------------------------------------------------------------------------------------
  gradeBands(schoolId: string) {
    return tenantTransaction(this.prisma, schoolId, (tx) => this.bandsIn(tx, schoolId));
  }

  async setGradeBands(schoolId: string, actorId: string, bands: GradeBandDto[]) {
    const problem = validateBands(bands);
    if (problem) throw badRequest(problem);
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await tx.gradeBand.deleteMany({ where: { schoolId } });
      await tx.gradeBand.createMany({ data: bands.map((b) => ({ schoolId, grade: b.grade, minPercent: b.minPercent, remark: b.remark })) });
      await this.audit(tx, schoolId, actorId, 'exam.grades.set', null, { grades: bands.length });
      return this.bandsIn(tx, schoolId);
    });
  }

  // ---- exams --------------------------------------------------------------------------------------------------------
  listExams(schoolId: string, sessionId: string | undefined): Promise<ExamDto[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      let session = sessionId;
      if (!session) session = (await tx.academicSession.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true } }))?.id;
      if (!session) return [];
      const rows = await tx.exam.findMany({ where: { schoolId, sessionId: session }, include: examInclude, orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }] });
      return (rows as ExamRow[]).map(toExamDto);
    });
  }

  createExam(schoolId: string, actorId: string, input: { name: string; sessionId?: string; startDate?: string | null; endDate?: string | null }): Promise<ExamDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const session = input.sessionId
        ? await tx.academicSession.findFirst({ where: { id: input.sessionId, schoolId }, select: { id: true } })
        : await tx.academicSession.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true } });
      if (!session) throw badRequest(input.sessionId ? 'Academic session not found.' : 'Set the current academic session first.');
      if (await tx.exam.findFirst({ where: { schoolId, sessionId: session.id, name: { equals: input.name, mode: 'insensitive' } }, select: { id: true } })) {
        throw conflict('An exam with this name already exists in this session.');
      }
      const exam = await tx.exam.create({ data: { schoolId, sessionId: session.id, name: input.name, startDate: optDate(input.startDate) ?? null, endDate: optDate(input.endDate) ?? null } });
      await this.audit(tx, schoolId, actorId, 'exam.create', exam.id, { name: exam.name });
      return this.detail(tx, schoolId, exam.id);
    });
  }

  getExam(schoolId: string, examId: string): Promise<ExamDetail> {
    return tenantTransaction(this.prisma, schoolId, (tx) => this.detail(tx, schoolId, examId));
  }

  updateExam(schoolId: string, actorId: string, examId: string, patch: { name?: string; startDate?: string | null; endDate?: string | null }): Promise<ExamDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const exam = await this.examRow(tx, schoolId, examId);
      if (exam.status === 'PUBLISHED') throw conflict('Results are published. Unpublish the exam before changing it.');
      const startDate = patch.startDate === undefined ? dayText(exam.startDate) : patch.startDate;
      const endDate = patch.endDate === undefined ? dayText(exam.endDate) : patch.endDate;
      if (startDate && endDate && endDate < startDate) throw badRequest('The end date must not be before the start date.');
      if (patch.name && patch.name.toLowerCase() !== exam.name.toLowerCase()
        && (await tx.exam.findFirst({ where: { schoolId, sessionId: exam.sessionId, name: { equals: patch.name, mode: 'insensitive' }, NOT: { id: examId } }, select: { id: true } }))) {
        throw conflict('An exam with this name already exists in this session.');
      }
      await tx.exam.update({ where: { id: examId }, data: { name: patch.name, startDate: optDate(patch.startDate), endDate: optDate(patch.endDate) } });
      await this.audit(tx, schoolId, actorId, 'exam.update', examId, { fields: Object.keys(patch) });
      return this.detail(tx, schoolId, examId);
    });
  }

  deleteExam(schoolId: string, actorId: string, examId: string): Promise<void> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const exam = await this.examRow(tx, schoolId, examId);
      if (exam.status === 'PUBLISHED') throw conflict('Results are published. Unpublish the exam before deleting it.');
      if ((await tx.examMark.count({ where: { schoolId, paper: { examId } } })) > 0) throw conflict('Marks have been entered for this exam, so it cannot be deleted.');
      await tx.exam.delete({ where: { id: examId } });
      await this.audit(tx, schoolId, actorId, 'exam.delete', examId, { name: exam.name });
    });
  }

  /** Replaces the papers of ONE class in this exam. A paper that already has marks cannot be removed or have its total lowered below a saved mark. */
  setPapers(schoolId: string, actorId: string, examId: string, classId: string, papers: PaperInput[]): Promise<ExamDetail> {
    const subjectIds = papers.map((p) => p.subjectId);
    if (new Set(subjectIds).size !== subjectIds.length) throw badRequest('A subject appears twice in the list.');
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const exam = await this.examRow(tx, schoolId, examId);
      if (exam.status === 'PUBLISHED') throw conflict('Results are published. Unpublish the exam before changing its papers.');
      if (!(await tx.schoolClass.findFirst({ where: { id: classId, schoolId }, select: { id: true } }))) throw notFound('Class not found');
      const offered = await tx.classSubject.findMany({ where: { schoolId, classId, subjectId: { in: subjectIds } }, select: { subjectId: true } });
      if (offered.length !== subjectIds.length) throw badRequest('Some subjects are not set up for this class (Classes > Subjects).');

      const existing = await tx.examPaper.findMany({ where: { schoolId, examId, classId }, include: { subject: { select: { name: true } }, marks: { select: { marks: true } } } });
      const keep = new Set(subjectIds);
      for (const old of existing.filter((p) => !keep.has(p.subjectId))) {
        if (old.marks.length > 0) throw conflict(`${old.subject.name} already has marks, so its paper cannot be removed.`);
      }
      for (const input of papers) {
        const old = existing.find((p) => p.subjectId === input.subjectId);
        const highest = old ? Math.max(0, ...old.marks.map((m) => m.marks ?? 0)) : 0;
        if (old && input.totalMarks < highest) throw conflict(`${old.subject.name} already has a mark of ${highest}, which is above the new total.`);
      }
      await tx.examPaper.deleteMany({ where: { schoolId, examId, classId, subjectId: { notIn: subjectIds } } });
      for (const input of papers) {
        const data = { totalMarks: input.totalMarks, passMarks: input.passMarks, examDate: optDate(input.examDate) ?? null };
        await tx.examPaper.upsert({
          where: { examId_classId_subjectId: { examId, classId, subjectId: input.subjectId } },
          create: { schoolId, examId, classId, subjectId: input.subjectId, ...data },
          update: data,
        });
      }
      await this.audit(tx, schoolId, actorId, 'exam.papers.set', examId, { classId, papers: papers.length });
      return this.detail(tx, schoolId, examId);
    });
  }

  // ---- marks --------------------------------------------------------------------------------------------------------
  /** Sections whose students the caller may enter marks for: null = every section (exam.manage), otherwise the sections the teacher teaches this subject in. */
  private async allowedSections(tx: Tx, schoolId: string, caller: Caller, exam: { sessionId: string }, paper: { classId: string; subjectId: string }): Promise<string[] | null> {
    if (caller.canManage) return null;
    const rows = await tx.teachingAssignment.findMany({
      where: { schoolId, sessionId: exam.sessionId, subjectId: paper.subjectId, section: { classId: paper.classId }, staff: { userId: caller.userId, deletedAt: null } },
      select: { sectionId: true },
    });
    return rows.map((r) => r.sectionId);
  }

  private access(status: 'DRAFT' | 'PUBLISHED', allowed: string[] | null): MarkAccess {
    if (status === 'PUBLISHED') return { canEnter: false, reason: 'PUBLISHED' };
    if (allowed !== null && allowed.length === 0) return { canEnter: false, reason: 'NOT_YOUR_SUBJECT' };
    return { canEnter: true, reason: null };
  }

  private async loadPaper(tx: Tx, schoolId: string, paperId: string) {
    const paper = await tx.examPaper.findFirst({ where: { id: paperId, schoolId }, include: { exam: true } });
    if (!paper) throw notFound('Paper not found');
    return paper;
  }

  private async marksSheet(tx: Tx, schoolId: string, paperId: string, caller: Caller): Promise<PaperMarks> {
    const paper = await this.loadPaper(tx, schoolId, paperId);
    const allowed = await this.allowedSections(tx, schoolId, caller, paper.exam, paper);
    const students = await tx.student.findMany({
      where: { schoolId, classId: paper.classId, status: 'ACTIVE', deletedAt: null, ...(allowed === null ? {} : { sectionId: { in: allowed } }) },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { admissionNo: 'asc' }],
      select: { id: true, admissionNo: true, firstName: true, lastName: true, section: { select: { name: true } } },
    });
    const marks = await tx.examMark.findMany({ where: { schoolId, paperId, studentId: { in: students.map((s) => s.id) } } });
    const byStudent = new Map(marks.map((m) => [m.studentId, m]));
    const dto = (await this.paperDtos(tx, schoolId, paper.examId)).find((p) => p.id === paperId) as PaperDto;
    return {
      exam: { id: paper.exam.id, name: paper.exam.name, status: paper.exam.status },
      paper: dto,
      access: this.access(paper.exam.status, allowed),
      students: students.map((s) => {
        const m = byStudent.get(s.id);
        return { studentId: s.id, admissionNo: s.admissionNo, name: fullName(s), sectionName: s.section?.name ?? null, marks: m?.marks ?? null, absent: m?.isAbsent ?? false, remark: m?.remark ?? null, entered: !!m };
      }),
    };
  }

  paperMarks(schoolId: string, paperId: string, caller: Caller): Promise<PaperMarks> {
    return tenantTransaction(this.prisma, schoolId, (tx) => this.marksSheet(tx, schoolId, paperId, caller));
  }

  saveMarks(schoolId: string, paperId: string, entries: MarkEntry[], caller: Caller): Promise<PaperMarks> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const paper = await this.loadPaper(tx, schoolId, paperId);
      const allowed = await this.allowedSections(tx, schoolId, caller, paper.exam, paper);
      const access = this.access(paper.exam.status, allowed);
      if (!access.canEnter) {
        throw access.reason === 'PUBLISHED'
          ? conflict('Results are published, so marks are locked. Ask someone who can publish results to unpublish the exam first.')
          : new AppError(403, 'FORBIDDEN', 'You can only enter marks for subjects and sections you teach.');
      }
      const ids = entries.map((e) => e.studentId);
      if (new Set(ids).size !== ids.length) throw badRequest('A student appears twice in the list.');
      const students = await tx.student.findMany({
        where: { schoolId, classId: paper.classId, status: 'ACTIVE', deletedAt: null, id: { in: ids }, ...(allowed === null ? {} : { sectionId: { in: allowed } }) },
        select: { id: true },
      });
      if (students.length !== ids.length) throw badRequest('Some students are not active students of this class (or not in your sections).');
      for (const e of entries) {
        if (e.marks !== null && e.marks !== undefined && !validMark(e.marks, paper)) throw badRequest(`Marks must be between 0 and ${paper.totalMarks}.`);
      }

      let saved = 0;
      let cleared = 0;
      for (const e of entries) {
        const absent = e.absent === true;
        const marks = absent ? null : (e.marks ?? null);
        if (!absent && marks === null) {
          const r = await tx.examMark.deleteMany({ where: { schoolId, paperId, studentId: e.studentId } });
          cleared += r.count;
          continue;
        }
        await tx.examMark.upsert({
          where: { paperId_studentId: { paperId, studentId: e.studentId } },
          create: { schoolId, paperId, studentId: e.studentId, marks, isAbsent: absent, remark: e.remark ?? null, enteredById: caller.userId },
          update: { marks, isAbsent: absent, remark: e.remark ?? null, enteredById: caller.userId },
        });
        saved += 1;
      }
      await this.audit(tx, schoolId, caller.userId, 'exam.marks.save', paper.examId, { paperId, saved, cleared });
      return this.marksSheet(tx, schoolId, paperId, caller);
    });
  }

  // ---- results ------------------------------------------------------------------------------------------------------
  /** Results of the whole class (positions are over the whole class even when one section is asked for). */
  private async computeClass(tx: Tx, schoolId: string, exam: ExamRow, classId: string) {
    const cls = await tx.schoolClass.findFirst({ where: { id: classId, schoolId }, select: { id: true, name: true } });
    if (!cls) throw notFound('Class not found');
    const papers = await tx.examPaper.findMany({ where: { schoolId, examId: exam.id, classId }, include: { subject: { select: { name: true } } }, orderBy: { subject: { name: 'asc' } } });
    const lite = papers.map((p) => ({ subjectId: p.subjectId, subjectName: p.subject.name, totalMarks: p.totalMarks, passMarks: p.passMarks }));
    const students = await tx.student.findMany({
      where: { schoolId, classId, status: 'ACTIVE', deletedAt: null },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, admissionNo: true, firstName: true, lastName: true, section: { select: { name: true } } },
    });
    const marks = await tx.examMark.findMany({ where: { schoolId, paperId: { in: papers.map((p) => p.id) } } });
    const subjectOfPaper = new Map(papers.map((p) => [p.id, p.subjectId]));
    const byStudent = new Map<string, Map<string, { marks: number | null; isAbsent: boolean }>>();
    for (const m of marks) {
      const map = byStudent.get(m.studentId) ?? new Map();
      map.set(subjectOfPaper.get(m.paperId) as string, { marks: m.marks, isAbsent: m.isAbsent });
      byStudent.set(m.studentId, map);
    }
    const { bands } = await this.bandsIn(tx, schoolId);
    const results = assignPositions(students.map((s) => buildStudentResult(
      { id: s.id, admissionNo: s.admissionNo, name: fullName(s), sectionName: s.section?.name ?? null }, lite, byStudent.get(s.id) ?? new Map(), bands,
    )));
    return { cls, lite, results };
  }

  classResults(schoolId: string, examId: string, classId: string, sectionId: string | undefined): Promise<ClassResults> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const exam = await this.examRow(tx, schoolId, examId);
      const { cls, lite, results } = await this.computeClass(tx, schoolId, exam, classId);
      let shown = results;
      if (sectionId) {
        const ids = new Set((await tx.student.findMany({ where: { schoolId, classId, sectionId, status: 'ACTIVE', deletedAt: null }, select: { id: true } })).map((s) => s.id));
        shown = results.filter((r) => ids.has(r.student.id));
      }
      return { exam: toExamDto(exam), class: cls, subjects: lite, students: shown, summary: summarize(shown) };
    });
  }

  studentResult(schoolId: string, examId: string, studentId: string): Promise<StudentExamResult> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const exam = await this.examRow(tx, schoolId, examId);
      const student = await tx.student.findFirst({ where: { id: studentId, schoolId, deletedAt: null }, select: { classId: true } });
      if (!student) throw notFound('Student not found');
      const { cls, lite, results } = await this.computeClass(tx, schoolId, exam, student.classId);
      if (lite.length === 0) throw notFound('This exam has no papers for the student\'s class.');
      const result = results.find((r) => r.student.id === studentId);
      if (!result) throw notFound('This student is not an active student of the class.');
      return { exam: toExamDto(exam), class: cls, classSize: results.length, result };
    });
  }

  // ---- publishing ---------------------------------------------------------------------------------------------------
  publish(schoolId: string, actorId: string, examId: string, force: boolean): Promise<ExamDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const exam = await this.examRow(tx, schoolId, examId);
      if (exam.status === 'PUBLISHED') throw conflict('Results are already published.');
      const papers = await this.paperDtos(tx, schoolId, examId);
      if (papers.length === 0) throw badRequest('Add at least one paper before publishing results.');
      const missing = papers.reduce((sum, p) => sum + Math.max(0, p.students - p.entered), 0);
      if (missing > 0 && !force) throw new AppError(409, 'MARKS_INCOMPLETE', `${missing} marks are still missing. Enter them, or publish anyway.`, { missing });
      await tx.exam.update({ where: { id: examId }, data: { status: 'PUBLISHED', publishedAt: this.now(), publishedById: actorId } });
      await this.audit(tx, schoolId, actorId, 'exam.publish', examId, { missing, forced: force && missing > 0 });
      return this.detail(tx, schoolId, examId);
    });
  }

  unpublish(schoolId: string, actorId: string, examId: string): Promise<ExamDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const exam = await this.examRow(tx, schoolId, examId);
      if (exam.status !== 'PUBLISHED') throw conflict('Results are not published.');
      await tx.exam.update({ where: { id: examId }, data: { status: 'DRAFT', publishedAt: null, publishedById: null } });
      await this.audit(tx, schoolId, actorId, 'exam.unpublish', examId);
      return this.detail(tx, schoolId, examId);
    });
  }
}
