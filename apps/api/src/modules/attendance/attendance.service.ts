import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { AppError, badRequest, notFound } from '../../utils/errors';
import { monthBounds, todayIn, totalsOf } from './attendance.logic';
import type {
  Access, AttendanceApi, AttendanceStatus, Caller, MonthlySheet, ReportDto, ReportFilter, SectionRef, SectionRoster, StaffEntry, StaffMonthlySheet,
  StaffRoster, StudentEntry, StudentHistory,
} from './attendance.types';

type Tx = Prisma.TransactionClient;
const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);
const dayText = (d: Date): string => d.toISOString().slice(0, 10);
const fullName = (p: { firstName: string; lastName: string }): string => `${p.firstName} ${p.lastName}`;

const BLOCKED: Record<NonNullable<Access['reason']>, () => AppError> = {
  FUTURE_DATE: () => badRequest('Attendance cannot be marked for a future date.'),
  HOLIDAY: () => new AppError(409, 'HOLIDAY', 'This day is a holiday in the academic calendar, so attendance cannot be marked.'),
  NOT_YOUR_SECTION: () => new AppError(403, 'FORBIDDEN', 'You can only mark attendance for sections you teach.'),
  PAST_DATE: () => new AppError(403, 'FORBIDDEN', 'Only today can be marked directly. Past days need someone with permission to correct attendance.'),
  NO_SESSION: () => badRequest('Set the current academic session first.'),
};

/** Student and staff attendance. Every query runs under Row Level Security. */
export class AttendanceService implements AttendanceApi {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string | null, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: 'attendance', entityId, metadata } });
  }

  /** Today's date in the school's own time zone (so "today" does not flip at the wrong hour). */
  private async today(tx: Tx, schoolId: string): Promise<string> {
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { timezone: true } });
    return todayIn(school?.timezone ?? 'UTC', this.now());
  }

  private async holiday(tx: Tx, schoolId: string, date: string): Promise<{ title: string } | null> {
    const d = toDate(date);
    const e = await tx.calendarEvent.findFirst({ where: { schoolId, type: 'HOLIDAY', startDate: { lte: d }, endDate: { gte: d } }, select: { title: true } });
    return e ? { title: e.title } : null;
  }

  private async holidaysIn(tx: Tx, schoolId: string, from: string, to: string): Promise<string[]> {
    const events = await tx.calendarEvent.findMany({ where: { schoolId, type: 'HOLIDAY', startDate: { lte: toDate(to) }, endDate: { gte: toDate(from) } }, select: { startDate: true, endDate: true } });
    const days = new Set<string>();
    for (const e of events) {
      for (let t = Math.max(e.startDate.getTime(), toDate(from).getTime()); t <= Math.min(e.endDate.getTime(), toDate(to).getTime()); t += 86_400_000) days.add(dayText(new Date(t)));
    }
    return [...days].sort();
  }

  private async section(tx: Tx, schoolId: string, id: string): Promise<SectionRef> {
    const s = await tx.section.findFirst({ where: { id, schoolId }, select: { id: true, name: true, classId: true, class: { select: { name: true } } } });
    if (!s) throw notFound('Section not found');
    return { id: s.id, name: s.name, classId: s.classId, className: s.class.name };
  }

  /** Teachers may only mark the sections they teach in the current session; people who can correct attendance may mark any. */
  private async accessFor(tx: Tx, schoolId: string, caller: Caller, sectionId: string, date: string, today: string, holiday: unknown): Promise<Access> {
    if (date > today) return { canMark: false, reason: 'FUTURE_DATE' };
    if (holiday) return { canMark: false, reason: 'HOLIDAY' };
    if (caller.canCorrect) return { canMark: true, reason: null };
    const session = await tx.academicSession.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true } });
    if (!session) return { canMark: false, reason: 'NO_SESSION' };
    const teaches = await tx.teachingAssignment.findFirst({ where: { schoolId, sessionId: session.id, sectionId, staff: { userId: caller.userId, deletedAt: null } }, select: { id: true } });
    if (!teaches) return { canMark: false, reason: 'NOT_YOUR_SECTION' };
    if (date < today) return { canMark: false, reason: 'PAST_DATE' };
    return { canMark: true, reason: null };
  }

  private async roster(tx: Tx, schoolId: string, sectionId: string, date: string, caller: Caller): Promise<SectionRoster> {
    const today = await this.today(tx, schoolId);
    const section = await this.section(tx, schoolId, sectionId);
    const holiday = await this.holiday(tx, schoolId, date);
    const access = await this.accessFor(tx, schoolId, caller, sectionId, date, today, holiday);
    const students = await tx.student.findMany({
      where: { schoolId, sectionId, status: 'ACTIVE', deletedAt: null },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { admissionNo: 'asc' }],
      select: { id: true, admissionNo: true, firstName: true, lastName: true },
    });
    const records = await tx.studentAttendance.findMany({ where: { schoolId, date: toDate(date), studentId: { in: students.map((s) => s.id) } } });
    const byStudent = new Map(records.map((r) => [r.studentId, r]));
    return {
      date, today, section, holiday, access, marked: records.length > 0,
      students: students.map((s) => ({ id: s.id, admissionNo: s.admissionNo, name: fullName(s), status: byStudent.get(s.id)?.status ?? null, remark: byStudent.get(s.id)?.remark ?? null })),
    };
  }

  sectionRoster(schoolId: string, sectionId: string, date: string | undefined, caller: Caller): Promise<SectionRoster> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => this.roster(tx, schoolId, sectionId, date ?? (await this.today(tx, schoolId)), caller));
  }

  markStudents(schoolId: string, sectionId: string, input: { date: string; entries: StudentEntry[] }, caller: Caller): Promise<SectionRoster> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const today = await this.today(tx, schoolId);
      const section = await this.section(tx, schoolId, sectionId);
      const holiday = await this.holiday(tx, schoolId, input.date);
      const access = await this.accessFor(tx, schoolId, caller, sectionId, input.date, today, holiday);
      if (!access.canMark && access.reason) throw BLOCKED[access.reason]();

      const ids = input.entries.map((e) => e.studentId);
      if (new Set(ids).size !== ids.length) throw badRequest('A student appears twice in the list.');
      const students = await tx.student.findMany({ where: { schoolId, sectionId, status: 'ACTIVE', deletedAt: null, id: { in: ids } }, select: { id: true } });
      if (students.length !== ids.length) throw badRequest('Some students are not active students of this section.');

      const date = toDate(input.date);
      const before = await tx.studentAttendance.findMany({ where: { schoolId, date, studentId: { in: ids } } });
      const previous = new Map(before.map((r) => [r.studentId, r.status]));
      let changed = 0;
      for (const e of input.entries) {
        if (previous.has(e.studentId) && previous.get(e.studentId) !== e.status) changed += 1;
        await tx.studentAttendance.upsert({
          where: { studentId_date: { studentId: e.studentId, date } },
          create: { schoolId, studentId: e.studentId, date, status: e.status, remark: e.remark ?? null, classId: section.classId, sectionId, markedById: caller.userId },
          update: { status: e.status, remark: e.remark ?? null, classId: section.classId, sectionId, markedById: caller.userId },
        });
      }
      await this.audit(tx, schoolId, caller.userId, changed > 0 || input.date < today ? 'attendance.student.correct' : 'attendance.student.mark', sectionId, {
        date: input.date, count: input.entries.length, changed, absent: input.entries.filter((e) => e.status === 'ABSENT').length,
      });
      return this.roster(tx, schoolId, sectionId, input.date, caller);
    });
  }

  sectionMonthly(schoolId: string, sectionId: string, month: string): Promise<MonthlySheet> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const section = await this.section(tx, schoolId, sectionId);
      const { from, to, days } = monthBounds(month);
      const [records, active, holidays] = await Promise.all([
        tx.studentAttendance.findMany({ where: { schoolId, sectionId, date: { gte: toDate(from), lte: toDate(to) } } }),
        tx.student.findMany({ where: { schoolId, sectionId, status: 'ACTIVE', deletedAt: null }, select: { id: true, admissionNo: true, firstName: true, lastName: true } }),
        this.holidaysIn(tx, schoolId, from, to),
      ]);
      // a student who moved out mid-month still shows the days recorded in this section
      const known = new Set(active.map((s) => s.id));
      const extraIds = [...new Set(records.map((r) => r.studentId))].filter((id) => !known.has(id));
      const extra = extraIds.length ? await tx.student.findMany({ where: { schoolId, id: { in: extraIds } }, select: { id: true, admissionNo: true, firstName: true, lastName: true } }) : [];
      const students = [...active, ...extra].sort((a, b) => fullName(a).localeCompare(fullName(b)));
      return {
        month, days, holidays, section,
        students: students.map((s) => {
          const mine = records.filter((r) => r.studentId === s.id);
          return { id: s.id, admissionNo: s.admissionNo, name: fullName(s), records: Object.fromEntries(mine.map((r) => [dayText(r.date), r.status])), totals: totalsOf(mine.map((r) => r.status)) };
        }),
      };
    });
  }

  studentHistory(schoolId: string, studentId: string, from: string, to: string): Promise<StudentHistory> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const s = await tx.student.findFirst({ where: { id: studentId, schoolId, deletedAt: null }, select: { id: true, admissionNo: true, firstName: true, lastName: true } });
      if (!s) throw notFound('Student not found');
      const rows = await tx.studentAttendance.findMany({ where: { schoolId, studentId, date: { gte: toDate(from), lte: toDate(to) } }, orderBy: { date: 'asc' } });
      return {
        student: { id: s.id, admissionNo: s.admissionNo, name: fullName(s) }, from, to,
        records: rows.map((r) => ({ date: dayText(r.date), status: r.status, remark: r.remark })),
        totals: totalsOf(rows.map((r) => r.status)),
      };
    });
  }

  /** Attendance percentage per student over a date range, lowest first. `below` keeps only students under that percentage. */
  studentReport(schoolId: string, filter: ReportFilter): Promise<ReportDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const grouped = await tx.studentAttendance.groupBy({
        by: ['studentId', 'status'],
        where: { schoolId, date: { gte: toDate(filter.from), lte: toDate(filter.to) }, ...(filter.classId ? { classId: filter.classId } : {}), ...(filter.sectionId ? { sectionId: filter.sectionId } : {}) },
        _count: { _all: true },
      });
      const byStudent = new Map<string, AttendanceStatus[]>();
      for (const g of grouped) {
        const list = byStudent.get(g.studentId) ?? [];
        for (let i = 0; i < g._count._all; i++) list.push(g.status);
        byStudent.set(g.studentId, list);
      }
      const students = byStudent.size
        ? await tx.student.findMany({ where: { schoolId, id: { in: [...byStudent.keys()] } }, select: { id: true, admissionNo: true, firstName: true, lastName: true, class: { select: { name: true } }, section: { select: { name: true } } } })
        : [];
      let rows = students.map((s) => ({
        student: { id: s.id, admissionNo: s.admissionNo, name: fullName(s), className: s.class.name, sectionName: s.section?.name ?? null },
        totals: totalsOf(byStudent.get(s.id) ?? []),
      }));
      if (filter.below !== undefined) rows = rows.filter((r) => r.totals.percentage !== null && r.totals.percentage < filter.below!);
      rows.sort((a, b) => (a.totals.percentage ?? 101) - (b.totals.percentage ?? 101) || a.student.name.localeCompare(b.student.name));
      return { from: filter.from, to: filter.to, total: rows.length, rows: rows.slice(0, filter.limit) };
    });
  }

  // ------------------------------------------------------------------ staff

  private async staffRosterIn(tx: Tx, schoolId: string, date: string): Promise<StaffRoster> {
    const today = await this.today(tx, schoolId);
    const staff = await tx.staff.findMany({
      where: { schoolId, status: 'ACTIVE', deletedAt: null },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, employeeNo: true, firstName: true, lastName: true, designation: true },
    });
    const records = await tx.staffAttendance.findMany({ where: { schoolId, date: toDate(date), staffId: { in: staff.map((s) => s.id) } } });
    const byStaff = new Map(records.map((r) => [r.staffId, r]));
    return {
      date, today, holiday: await this.holiday(tx, schoolId, date), marked: records.length > 0,
      staff: staff.map((s) => ({ id: s.id, employeeNo: s.employeeNo, name: fullName(s), designation: s.designation, status: byStaff.get(s.id)?.status ?? null, remark: byStaff.get(s.id)?.remark ?? null })),
    };
  }

  staffRoster(schoolId: string, date: string | undefined): Promise<StaffRoster> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => this.staffRosterIn(tx, schoolId, date ?? (await this.today(tx, schoolId))));
  }

  markStaff(schoolId: string, input: { date: string; entries: StaffEntry[] }, caller: Caller): Promise<StaffRoster> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const today = await this.today(tx, schoolId);
      if (input.date > today) throw badRequest('Attendance cannot be marked for a future date.');
      const ids = input.entries.map((e) => e.staffId);
      if (new Set(ids).size !== ids.length) throw badRequest('A staff member appears twice in the list.');
      const date = toDate(input.date);
      const staff = await tx.staff.findMany({ where: { schoolId, status: 'ACTIVE', deletedAt: null, id: { in: ids } }, select: { id: true, joiningDate: true } });
      if (staff.length !== ids.length) throw badRequest('Some staff members are not active.');
      if (staff.some((s) => s.joiningDate > date)) throw badRequest('Attendance cannot be marked before a staff member joined.');

      const before = await tx.staffAttendance.findMany({ where: { schoolId, date, staffId: { in: ids } } });
      const previous = new Map(before.map((r) => [r.staffId, r.status]));
      let changed = 0;
      for (const e of input.entries) {
        if (previous.has(e.staffId) && previous.get(e.staffId) !== e.status) changed += 1;
        await tx.staffAttendance.upsert({
          where: { staffId_date: { staffId: e.staffId, date } },
          create: { schoolId, staffId: e.staffId, date, status: e.status, remark: e.remark ?? null, markedById: caller.userId },
          update: { status: e.status, remark: e.remark ?? null, markedById: caller.userId },
        });
      }
      await this.audit(tx, schoolId, caller.userId, changed > 0 || input.date < today ? 'attendance.staff.correct' : 'attendance.staff.mark', null, { date: input.date, count: input.entries.length, changed });
      return this.staffRosterIn(tx, schoolId, input.date);
    });
  }

  staffMonthly(schoolId: string, month: string): Promise<StaffMonthlySheet> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const { from, to, days } = monthBounds(month);
      const [records, active, holidays] = await Promise.all([
        tx.staffAttendance.findMany({ where: { schoolId, date: { gte: toDate(from), lte: toDate(to) } } }),
        tx.staff.findMany({ where: { schoolId, status: 'ACTIVE', deletedAt: null }, select: { id: true, employeeNo: true, firstName: true, lastName: true } }),
        this.holidaysIn(tx, schoolId, from, to),
      ]);
      const known = new Set(active.map((s) => s.id));
      const extraIds = [...new Set(records.map((r) => r.staffId))].filter((id) => !known.has(id));
      const extra = extraIds.length ? await tx.staff.findMany({ where: { schoolId, id: { in: extraIds } }, select: { id: true, employeeNo: true, firstName: true, lastName: true } }) : [];
      const staff = [...active, ...extra].sort((a, b) => fullName(a).localeCompare(fullName(b)));
      return {
        month, days, holidays,
        staff: staff.map((s) => {
          const mine = records.filter((r) => r.staffId === s.id);
          return { id: s.id, employeeNo: s.employeeNo, name: fullName(s), records: Object.fromEntries(mine.map((r) => [dayText(r.date), r.status])), totals: totalsOf(mine.map((r) => r.status)) };
        }),
      };
    });
  }
}
