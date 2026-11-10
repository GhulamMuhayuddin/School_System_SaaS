import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { conflict, notFound } from '../../utils/errors';
import { VISIT_COUNTER, dayRange, minutesInside, visitNo } from './visitors.logic';
import type { VisitDto, VisitFilter, VisitInput, VisitPatch, VisitSummary, VisitorsApi } from './visitors.types';

type Tx = Prisma.TransactionClient;
const LIMIT = 300;
const dayText = (d: Date): string => d.toISOString().slice(0, 10);
const blank = (v: string | null | undefined): string | null => (v === undefined || v === null || v.trim() === '' ? null : v.trim());

const include = { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } } as const;
type Row = Prisma.VisitGetPayload<{ include: typeof include }>;

/** The gate log. A visitor still inside has no check-out time; the list "inside now" spans all days so a forgotten check-out is never hidden. */
export class VisitorsService implements VisitorsApi {
  constructor(private readonly prisma: PrismaClient, private readonly now: () => Date = () => new Date()) {}

  private dto(r: Row): VisitDto {
    const inAt = r.checkInAt.toISOString();
    const outAt = r.checkOutAt ? r.checkOutAt.toISOString() : null;
    return {
      id: r.id, visitNo: r.visitNo, name: r.name, phone: r.phone, purpose: r.purpose, visiting: r.visiting,
      student: r.student ? { id: r.student.id, name: `${r.student.firstName} ${r.student.lastName}`, admissionNo: r.student.admissionNo } : null,
      notes: r.notes, checkInAt: inAt, checkOutAt: outAt, minutes: minutesInside(inAt, outAt), inside: outAt === null,
    };
  }

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string | null, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: 'visitor', entityId, metadata } });
  }

  private async load(tx: Tx, schoolId: string, id: string): Promise<Row> {
    const r = await tx.visit.findFirst({ where: { id, schoolId }, include });
    if (!r) throw notFound('Visit not found');
    return r;
  }

  summary(schoolId: string): Promise<VisitSummary> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const { start, end } = dayRange(dayText(this.now()));
      const [today, inside] = await Promise.all([
        tx.visit.count({ where: { schoolId, checkInAt: { gte: start, lt: end } } }),
        tx.visit.count({ where: { schoolId, checkOutAt: null } }),
      ]);
      return { today, inside };
    });
  }

  list(schoolId: string, filter: VisitFilter): Promise<{ visits: VisitDto[]; truncated: boolean }> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const q = filter.q?.trim();
      const { start, end } = dayRange(filter.date ?? dayText(this.now()));
      const rows = await tx.visit.findMany({
        where: {
          schoolId, ...(filter.insideOnly ? { checkOutAt: null } : { checkInAt: { gte: start, lt: end } }),
          ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { purpose: { contains: q, mode: 'insensitive' } }, { visiting: { contains: q, mode: 'insensitive' } }, { visitNo: { contains: q, mode: 'insensitive' } }] } : {}),
        },
        include, orderBy: [{ checkInAt: 'desc' }], take: LIMIT + 1,
      });
      return { visits: rows.slice(0, LIMIT).map((r) => this.dto(r)), truncated: rows.length > LIMIT };
    });
  }

  checkIn(schoolId: string, actorId: string, input: VisitInput): Promise<VisitDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      if (input.studentId) {
        const s = await tx.student.findFirst({ where: { id: input.studentId, schoolId, deletedAt: null }, select: { id: true } });
        if (!s) throw notFound('Student not found');
      }
      const c = await tx.schoolCounter.upsert({ where: { schoolId_key: { schoolId, key: VISIT_COUNTER } }, update: { value: { increment: 1 } }, create: { schoolId, key: VISIT_COUNTER, value: 1 } });
      const r = await tx.visit.create({
        data: {
          schoolId, visitNo: visitNo(c.value), name: input.name.trim(), phone: blank(input.phone), purpose: input.purpose.trim(), visiting: blank(input.visiting),
          studentId: input.studentId ?? null, notes: blank(input.notes), checkInAt: this.now(), checkedInById: actorId,
        },
        include,
      });
      await this.audit(tx, schoolId, actorId, 'visitor.checkin', r.id, { visitNo: r.visitNo, name: r.name, purpose: r.purpose });
      return this.dto(r);
    });
  }

  checkOut(schoolId: string, actorId: string, id: string): Promise<VisitDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM visits WHERE id = ${id}::uuid FOR UPDATE`;
      const r = await this.load(tx, schoolId, id);
      if (r.checkOutAt !== null) throw conflict('This visitor is already checked out');
      await tx.visit.update({ where: { id }, data: { checkOutAt: this.now(), checkedOutById: actorId } });
      await this.audit(tx, schoolId, actorId, 'visitor.checkout', id, { visitNo: r.visitNo });
      return this.dto(await this.load(tx, schoolId, id));
    });
  }

  update(schoolId: string, actorId: string, id: string, patch: VisitPatch): Promise<VisitDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const r = await this.load(tx, schoolId, id);
      const data: Prisma.VisitUncheckedUpdateInput = {};
      if (patch.name !== undefined) data.name = patch.name.trim();
      if (patch.phone !== undefined) data.phone = blank(patch.phone);
      if (patch.purpose !== undefined) data.purpose = patch.purpose.trim();
      if (patch.visiting !== undefined) data.visiting = blank(patch.visiting);
      if (patch.notes !== undefined) data.notes = blank(patch.notes);
      if (patch.studentId !== undefined) {
        if (patch.studentId !== null) {
          const s = await tx.student.findFirst({ where: { id: patch.studentId, schoolId, deletedAt: null }, select: { id: true } });
          if (!s) throw notFound('Student not found');
        }
        data.studentId = patch.studentId;
      }
      await tx.visit.update({ where: { id }, data });
      await this.audit(tx, schoolId, actorId, 'visitor.update', id, { visitNo: r.visitNo });
      return this.dto(await this.load(tx, schoolId, id));
    });
  }
}
