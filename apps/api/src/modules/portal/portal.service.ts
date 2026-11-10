import type { PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { AppError, notFound } from '../../utils/errors';
import type { AttendanceApi, StudentHistory } from '../attendance/attendance.types';
import type { CalendarApi, CalendarEventDto } from '../calendar/calendar.types';
import type { LibraryApi, StudentLibrary } from '../library/library.types';
import type { HostelApi, StudentHostel } from '../hostel/hostel.types';
import type { StudentTransport, TransportApi } from '../transport/transport.types';
import type { ExamsApi, StudentExamResult } from '../exams/exams.types';
import type { FeesApi, VoucherDetail, VoucherDto } from '../fees/fees.types';
import { childStatus, homeworkState, type SubmissionStatusKey } from '../homework/homework.logic';
import type { ChildHomework } from '../homework/homework.types';
import type { SectionTimetable, TimetableApi } from '../timetable/timetable.types';

export interface PortalChild {
  id: string; admissionNo: string; firstName: string; lastName: string; status: string;
  class: { id: string; name: string }; section: { id: string; name: string } | null; relation: string;
}
export type PortalViewer = 'PARENT' | 'STUDENT';
export interface PortalChildren { viewer: PortalViewer; guardianName: string | null; children: PortalChild[] }
export interface PortalFees { vouchers: VoucherDto[]; totals: { billed: number; paid: number; balance: number; overdueBalance: number } }
export interface PortalAttendance extends StudentHistory { month: string }
export type PortalResult = StudentExamResult;

export interface PortalApi {
  children(schoolId: string, userId: string): Promise<PortalChildren>;
  /** Homework of one own child (404 when the student is not the caller's child / the caller). */
  childHomework(schoolId: string, userId: string, studentId: string, range: { from?: string; to?: string }, today?: string): Promise<ChildHomework[]>;
  childAttendance(schoolId: string, userId: string, studentId: string, month: string): Promise<PortalAttendance>;
  /** Published exams only. */
  childResults(schoolId: string, userId: string, studentId: string): Promise<PortalResult[]>;
  childFees(schoolId: string, userId: string, studentId: string): Promise<PortalFees>;
  childVoucher(schoolId: string, userId: string, studentId: string, voucherId: string): Promise<VoucherDetail>;
  /** null when the student has no section yet. */
  childTimetable(schoolId: string, userId: string, studentId: string): Promise<SectionTimetable | null>;
  calendar(schoolId: string, range: { from: string; to: string }): Promise<CalendarEventDto[]>;
  childLibrary(schoolId: string, userId: string, studentId: string): Promise<StudentLibrary>;
  childTransport(schoolId: string, userId: string, studentId: string): Promise<StudentTransport>;
  childHostel(schoolId: string, userId: string, studentId: string): Promise<StudentHostel>;
}

export interface PortalDeps {
  attendance: Pick<AttendanceApi, 'studentHistory'>;
  exams: Pick<ExamsApi, 'listExams' | 'studentResult'>;
  fees: Pick<FeesApi, 'listVouchers' | 'getVoucher'>;
  timetable: Pick<TimetableApi, 'sectionTimetable'>;
  calendar: Pick<CalendarApi, 'list'>;
  library: Pick<LibraryApi, 'studentLibrary'>;
  transport: Pick<TransportApi, 'studentTransport'>;
  hostel: Pick<HostelApi, 'studentHostel'>;
}

/** First and last day (YYYY-MM-DD) of a YYYY-MM month. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

const childSelect = {
  id: true, admissionNo: true, firstName: true, lastName: true, status: true, sectionId: true,
  class: { select: { id: true, name: true } }, section: { select: { id: true, name: true } },
} as const;

/**
 * Portal data. A parent sees only the students linked to the guardian record of the signed-in user;
 * a student login sees only the student record it is attached to (Student.userId). Everything else is a 404.
 */
export class PortalService implements PortalApi {
  constructor(private readonly prisma: PrismaClient, private readonly deps: PortalDeps) {}

  private ownWhere(schoolId: string, userId: string, studentId: string) {
    return { id: studentId, schoolId, deletedAt: null, OR: [{ userId }, { guardians: { some: { guardian: { userId } } } }] };
  }

  /** The caller's own student (guardian link OR own student login). 404 otherwise, so ids of other families are never confirmed. */
  private ownChild(schoolId: string, userId: string, studentId: string): Promise<{ id: string; sectionId: string | null }> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const s = await tx.student.findFirst({ where: this.ownWhere(schoolId, userId, studentId), select: { id: true, sectionId: true } });
      if (!s) throw notFound('Student not found');
      return s;
    });
  }

  children(schoolId: string, userId: string): Promise<PortalChildren> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const own = await tx.student.findFirst({ where: { schoolId, userId, deletedAt: null }, select: childSelect });
      if (own) return { viewer: 'STUDENT' as const, guardianName: null, children: [{ ...own, relation: 'SELF' }] as PortalChild[] };
      const guardian = await tx.guardian.findFirst({ where: { schoolId, userId }, select: { id: true, name: true } });
      if (!guardian) return { viewer: 'PARENT' as const, guardianName: null, children: [] };
      const links = await tx.studentGuardian.findMany({
        where: { schoolId, guardianId: guardian.id, student: { deletedAt: null } },
        orderBy: { createdAt: 'asc' },
        select: { relation: true, student: { select: childSelect } },
      });
      return { viewer: 'PARENT' as const, guardianName: guardian.name, children: links.map((l) => ({ ...l.student, relation: l.relation })) as PortalChild[] };
    });
  }

  childHomework(schoolId: string, userId: string, studentId: string, range: { from?: string; to?: string }, today: string = new Date().toISOString().slice(0, 10)): Promise<ChildHomework[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const own = await tx.student.findFirst({ where: this.ownWhere(schoolId, userId, studentId), select: { sectionId: true } });
      if (!own) throw notFound('Student not found');
      const sectionId = own.sectionId;
      if (!sectionId) return [];
      const day = (d: string) => new Date(`${d}T00:00:00Z`);
      const rows = await tx.homework.findMany({
        where: { schoolId, sectionId, ...(range.from || range.to ? { dueDate: { ...(range.from ? { gte: day(range.from) } : {}), ...(range.to ? { lte: day(range.to) } : {}) } } : {}) },
        include: { subject: { select: { name: true } }, submissions: { where: { studentId }, select: { status: true, marks: true, remark: true } } },
        orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }], take: 200,
      });
      return rows.map((r) => {
        const sub = r.submissions[0];
        const due = r.dueDate.toISOString().slice(0, 10);
        return {
          id: r.id, title: r.title, description: r.description, subject: r.subject.name, assignedDate: r.assignedDate.toISOString().slice(0, 10), dueDate: due, maxMarks: r.maxMarks,
          state: homeworkState(due, today), status: childStatus((sub?.status as SubmissionStatusKey | undefined) ?? null), marks: sub?.marks ?? null, remark: sub?.remark ?? null,
        };
      });
    });
  }

  async childAttendance(schoolId: string, userId: string, studentId: string, month: string): Promise<PortalAttendance> {
    await this.ownChild(schoolId, userId, studentId);
    const { from, to } = monthRange(month);
    return { month, ...(await this.deps.attendance.studentHistory(schoolId, studentId, from, to)) };
  }

  async childResults(schoolId: string, userId: string, studentId: string): Promise<PortalResult[]> {
    await this.ownChild(schoolId, userId, studentId);
    const exams = (await this.deps.exams.listExams(schoolId, undefined)).filter((e) => e.status === 'PUBLISHED');
    const out: PortalResult[] = [];
    for (const e of exams) {
      try {
        out.push(await this.deps.exams.studentResult(schoolId, e.id, studentId));
      } catch (err) {
        // an exam without papers for this class (or a student not on its roll) simply has nothing to show
        if (err instanceof AppError && err.status === 404) continue;
        throw err;
      }
    }
    return out;
  }

  async childFees(schoolId: string, userId: string, studentId: string): Promise<PortalFees> {
    await this.ownChild(schoolId, userId, studentId);
    const vouchers = (await this.deps.fees.listVouchers(schoolId, { studentId })).filter((v) => v.status !== 'CANCELLED');
    const sum = (f: (v: VoucherDto) => number) => vouchers.reduce((a, v) => a + f(v), 0);
    return { vouchers, totals: { billed: sum((v) => v.netAmount), paid: sum((v) => v.paidAmount), balance: sum((v) => v.balance), overdueBalance: sum((v) => (v.overdue ? v.balance : 0)) } };
  }

  async childVoucher(schoolId: string, userId: string, studentId: string, voucherId: string): Promise<VoucherDetail> {
    await this.ownChild(schoolId, userId, studentId);
    const v = await this.deps.fees.getVoucher(schoolId, voucherId);
    if (v.student.id !== studentId) throw notFound('Voucher not found');
    return v;
  }

  async childTimetable(schoolId: string, userId: string, studentId: string): Promise<SectionTimetable | null> {
    const own = await this.ownChild(schoolId, userId, studentId);
    if (!own.sectionId) return null;
    return this.deps.timetable.sectionTimetable(schoolId, own.sectionId);
  }

  calendar(schoolId: string, range: { from: string; to: string }): Promise<CalendarEventDto[]> {
    return this.deps.calendar.list(schoolId, range);
  }

  async childLibrary(schoolId: string, userId: string, studentId: string): Promise<StudentLibrary> {
    await this.ownChild(schoolId, userId, studentId);
    return this.deps.library.studentLibrary(schoolId, studentId);
  }

  async childTransport(schoolId: string, userId: string, studentId: string): Promise<StudentTransport> {
    await this.ownChild(schoolId, userId, studentId);
    return this.deps.transport.studentTransport(schoolId, studentId);
  }

  async childHostel(schoolId: string, userId: string, studentId: string): Promise<StudentHostel> {
    await this.ownChild(schoolId, userId, studentId);
    return this.deps.hostel.studentHostel(schoolId, studentId);
  }
}
