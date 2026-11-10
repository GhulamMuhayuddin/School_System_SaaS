import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { COMPLAINT_COUNTER, canMove, complaintNo, resolutionOk, type ComplaintStatusValue } from './complaints.logic';
import type {
  ComplaintCategory, ComplaintDetail, ComplaintDto, ComplaintFilter, ComplaintInput, ComplaintPatch, ComplaintPriority, ComplaintSource, ComplaintSummary, ComplaintsApi, NoteDto, NoteKind,
} from './complaints.types';

type Tx = Prisma.TransactionClient;
const LIMIT = 300;
const blank = (v: string | null | undefined): string | null => (v === undefined || v === null || v.trim() === '' ? null : v.trim());
const fullName = (p: { firstName: string; lastName: string }): string => `${p.firstName} ${p.lastName}`;

const include = {
  student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
  assignedStaff: { select: { id: true, firstName: true, lastName: true } },
} as const;
type Row = Prisma.ComplaintGetPayload<{ include: typeof include }>;

const dto = (r: Row): ComplaintDto => ({
  id: r.id, complaintNo: r.complaintNo, source: r.source as ComplaintSource, name: r.name, phone: r.phone,
  student: r.student ? { id: r.student.id, name: fullName(r.student), admissionNo: r.student.admissionNo } : null,
  category: r.category as ComplaintCategory, subject: r.subject, details: r.details, priority: r.priority as ComplaintPriority, status: r.status as ComplaintStatusValue,
  assignedTo: r.assignedStaff ? { id: r.assignedStaff.id, name: fullName(r.assignedStaff) } : null, resolution: r.resolution, resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null, createdAt: r.createdAt.toISOString(),
});

/** Complaints with a follow-up timeline. Every status change and assignment also writes a timeline entry, so the history explains itself. */
export class ComplaintsService implements ComplaintsApi {
  constructor(private readonly prisma: PrismaClient, private readonly now: () => Date = () => new Date()) {}

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string | null, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: 'complaint', entityId, metadata } });
  }

  private note(tx: Tx, schoolId: string, complaintId: string, kind: NoteKind, text: string, actorId: string) {
    return tx.complaintNote.create({ data: { schoolId, complaintId, kind, text, createdById: actorId } });
  }

  private async load(tx: Tx, schoolId: string, id: string): Promise<Row> {
    const r = await tx.complaint.findFirst({ where: { id, schoolId }, include });
    if (!r) throw notFound('Complaint not found');
    return r;
  }

  private async detail(tx: Tx, schoolId: string, id: string): Promise<ComplaintDetail> {
    const r = await this.load(tx, schoolId, id);
    const notes = await tx.complaintNote.findMany({ where: { schoolId, complaintId: id }, orderBy: [{ createdAt: 'asc' }] });
    const ids = [...new Set(notes.map((n) => n.createdById).filter((v): v is string => v !== null))];
    const users = ids.length === 0 ? [] : await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } });
    const who = new Map(users.map((u) => [u.id, fullName(u)] as const));
    const list: NoteDto[] = notes.map((n) => ({ id: n.id, kind: n.kind as NoteKind, text: n.text, by: n.createdById ? who.get(n.createdById) ?? null : null, createdAt: n.createdAt.toISOString() }));
    return { complaint: dto(r), notes: list };
  }

  private async checkStudent(tx: Tx, schoolId: string, studentId: string | null | undefined): Promise<void> {
    if (!studentId) return;
    const s = await tx.student.findFirst({ where: { id: studentId, schoolId, deletedAt: null }, select: { id: true } });
    if (!s) throw notFound('Student not found');
  }

  summary(schoolId: string): Promise<ComplaintSummary> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      // Four COUNT queries instead of loading every complaint row into memory.
      const [open, inProgress, highActive, resolved] = await Promise.all([
        tx.complaint.count({ where: { schoolId, status: 'OPEN' } }),
        tx.complaint.count({ where: { schoolId, status: 'IN_PROGRESS' } }),
        tx.complaint.count({ where: { schoolId, priority: 'HIGH', status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
        tx.complaint.count({ where: { schoolId, status: { in: ['RESOLVED', 'CLOSED'] } } }),
      ]);
      return { open, inProgress, highActive, resolved };
    });
  }

  list(schoolId: string, filter: ComplaintFilter): Promise<{ complaints: ComplaintDto[]; truncated: boolean }> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const q = filter.q?.trim();
      const rows = await tx.complaint.findMany({
        where: {
          schoolId, ...(filter.status ? { status: filter.status } : filter.activeOnly ? { status: { in: ['OPEN', 'IN_PROGRESS'] } } : {}),
          ...(filter.category ? { category: filter.category } : {}), ...(filter.priority ? { priority: filter.priority } : {}), ...(filter.assignedStaffId ? { assignedStaffId: filter.assignedStaffId } : {}),
          ...(q ? { OR: [{ subject: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }, { complaintNo: { contains: q, mode: 'insensitive' } }] } : {}),
        },
        include, orderBy: [{ createdAt: 'desc' }], take: LIMIT + 1,
      });
      return { complaints: rows.slice(0, LIMIT).map(dto), truncated: rows.length > LIMIT };
    });
  }

  get(schoolId: string, id: string): Promise<ComplaintDetail> {
    return tenantTransaction(this.prisma, schoolId, (tx) => this.detail(tx, schoolId, id));
  }

  create(schoolId: string, actorId: string, input: ComplaintInput): Promise<ComplaintDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await this.checkStudent(tx, schoolId, input.studentId);
      const c = await tx.schoolCounter.upsert({ where: { schoolId_key: { schoolId, key: COMPLAINT_COUNTER } }, update: { value: { increment: 1 } }, create: { schoolId, key: COMPLAINT_COUNTER, value: 1 } });
      const r = await tx.complaint.create({
        data: {
          schoolId, complaintNo: complaintNo(c.value), source: input.source, name: input.name.trim(), phone: blank(input.phone), studentId: input.studentId ?? null,
          category: input.category, subject: input.subject.trim(), details: input.details.trim(), priority: input.priority ?? 'NORMAL', createdById: actorId,
        },
      });
      await this.audit(tx, schoolId, actorId, 'complaint.create', r.id, { complaintNo: r.complaintNo, category: r.category, priority: r.priority });
      return this.detail(tx, schoolId, r.id);
    });
  }

  update(schoolId: string, actorId: string, id: string, patch: ComplaintPatch): Promise<ComplaintDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const r = await this.load(tx, schoolId, id);
      const data: Prisma.ComplaintUncheckedUpdateInput = {};
      if (patch.name !== undefined) data.name = patch.name.trim();
      if (patch.phone !== undefined) data.phone = blank(patch.phone);
      if (patch.category !== undefined) data.category = patch.category;
      if (patch.subject !== undefined) data.subject = patch.subject.trim();
      if (patch.details !== undefined) data.details = patch.details.trim();
      if (patch.priority !== undefined) data.priority = patch.priority;
      if (patch.studentId !== undefined) { await this.checkStudent(tx, schoolId, patch.studentId); data.studentId = patch.studentId; }
      await tx.complaint.update({ where: { id }, data });
      await this.audit(tx, schoolId, actorId, 'complaint.update', id, { complaintNo: r.complaintNo });
      return this.detail(tx, schoolId, id);
    });
  }

  assign(schoolId: string, actorId: string, id: string, staffId: string | null): Promise<ComplaintDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const r = await this.load(tx, schoolId, id);
      let text = 'Unassigned';
      if (staffId !== null) {
        const s = await tx.staff.findFirst({ where: { id: staffId, schoolId, deletedAt: null }, select: { id: true, firstName: true, lastName: true, status: true } });
        if (!s) throw notFound('Staff member not found');
        if (s.status !== 'ACTIVE') throw badRequest('This staff member has left the school');
        text = `Assigned to ${fullName(s)}`;
      }
      if ((r.assignedStaffId ?? null) === staffId) throw conflict('The complaint is already assigned that way');
      await tx.complaint.update({ where: { id }, data: { assignedStaffId: staffId } });
      await this.note(tx, schoolId, id, 'ASSIGN', text, actorId);
      await this.audit(tx, schoolId, actorId, 'complaint.assign', id, { complaintNo: r.complaintNo, staffId });
      return this.detail(tx, schoolId, id);
    });
  }

  setStatus(schoolId: string, actorId: string, id: string, status: ComplaintStatusValue, resolution: string | null): Promise<ComplaintDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM complaints WHERE id = ${id}::uuid FOR UPDATE`;
      const r = await this.load(tx, schoolId, id);
      const from = r.status as ComplaintStatusValue;
      if (!canMove(from, status)) throw conflict(`A ${from.toLowerCase().replace('_', ' ')} complaint cannot become ${status.toLowerCase().replace('_', ' ')}`);
      if (status === 'RESOLVED' && !resolutionOk(resolution)) throw badRequest('Write how the complaint was resolved (at least 3 characters)');
      const data: Prisma.ComplaintUncheckedUpdateInput = { status };
      if (status === 'RESOLVED') { data.resolution = resolution!.trim(); data.resolvedAt = this.now(); }
      if (status === 'OPEN') data.resolvedAt = null;
      await tx.complaint.update({ where: { id }, data });
      await this.note(tx, schoolId, id, 'STATUS', status === 'RESOLVED' ? `Status: ${from} → ${status}. ${resolution!.trim()}` : `Status: ${from} → ${status}`, actorId);
      await this.audit(tx, schoolId, actorId, 'complaint.status', id, { complaintNo: r.complaintNo, from, to: status });
      return this.detail(tx, schoolId, id);
    });
  }

  addNote(schoolId: string, actorId: string, id: string, text: string): Promise<ComplaintDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await this.load(tx, schoolId, id);
      await this.note(tx, schoolId, id, 'NOTE', text.trim(), actorId);
      return this.detail(tx, schoolId, id);
    });
  }
}
