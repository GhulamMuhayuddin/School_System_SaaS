import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { CERT_COUNTER, certNo, certStatus, eligibility, oneAtATime, type CertificateTypeValue, type StudentStatusValue } from './certificates.logic';
import type { CertificateDetail, CertificateDto, CertificateFilter, CertificatesApi, Gender, IssueInput, SchoolHeader } from './certificates.types';

type Tx = Prisma.TransactionClient;
const LIMIT = 300;
const dayText = (d: Date): string => d.toISOString().slice(0, 10);
const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);
const blank = (v: string | null | undefined): string | null => (v === undefined || v === null || v.trim() === '' ? null : v.trim());

type Row = Prisma.CertificateGetPayload<Record<string, never>>;

/** The certificate register. Each entry copies the student's details on the issue day, so a reprint is always identical to the original. */
export class CertificatesService implements CertificatesApi {
  constructor(private readonly prisma: PrismaClient, private readonly now: () => Date = () => new Date()) {}

  private today(): string { return dayText(this.now()); }

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string | null, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: 'certificate', entityId, metadata } });
  }

  private async names(tx: Tx, rows: { issuedById: string | null }[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((r) => r.issuedById).filter((v): v is string => v !== null))];
    const users = ids.length === 0 ? [] : await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`] as const));
  }

  private dto(r: Row, who: Map<string, string>): CertificateDto {
    return {
      id: r.id, certNo: r.certNo, type: r.type as CertificateTypeValue, studentId: r.studentId, studentName: r.studentName, gender: r.gender as Gender, fatherName: r.fatherName,
      admissionNo: r.admissionNo, className: r.className, sectionName: r.sectionName, dateOfBirth: dayText(r.dateOfBirth), admissionDate: dayText(r.admissionDate),
      leftAt: r.leftAt ? dayText(r.leftAt) : null, issuedOn: dayText(r.issuedOn), purpose: r.purpose, remarks: r.remarks,
      status: certStatus(r.voidedAt ? r.voidedAt.toISOString() : null), voidReason: r.voidReason, issuedBy: r.issuedById ? who.get(r.issuedById) ?? null : null, createdAt: r.createdAt.toISOString(),
    };
  }

  private async detail(tx: Tx, schoolId: string, id: string): Promise<CertificateDetail> {
    const r = await tx.certificate.findFirst({ where: { id, schoolId } });
    if (!r) throw notFound('Certificate not found');
    const school = await tx.school.findFirst({ where: { id: schoolId }, select: { name: true, address: true, city: true, phone: true, email: true } });
    const header: SchoolHeader = school ?? { name: '', address: null, city: null, phone: null, email: null };
    return { certificate: this.dto(r, await this.names(tx, [r])), school: header };
  }

  list(schoolId: string, filter: CertificateFilter): Promise<{ certificates: CertificateDto[]; truncated: boolean }> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const q = filter.q?.trim();
      const rows = await tx.certificate.findMany({
        where: {
          schoolId, ...(filter.type ? { type: filter.type } : {}), ...(filter.studentId ? { studentId: filter.studentId } : {}),
          ...(filter.status === 'VOID' ? { voidedAt: { not: null } } : filter.status === 'VALID' ? { voidedAt: null } : {}),
          ...(q ? { OR: [{ studentName: { contains: q, mode: 'insensitive' } }, { admissionNo: { contains: q, mode: 'insensitive' } }, { certNo: { contains: q, mode: 'insensitive' } }] } : {}),
        },
        orderBy: [{ createdAt: 'desc' }], take: LIMIT + 1,
      });
      const who = await this.names(tx, rows);
      return { certificates: rows.slice(0, LIMIT).map((r) => this.dto(r, who)), truncated: rows.length > LIMIT };
    });
  }

  get(schoolId: string, id: string): Promise<CertificateDetail> {
    return tenantTransaction(this.prisma, schoolId, (tx) => this.detail(tx, schoolId, id));
  }

  issue(schoolId: string, actorId: string, input: IssueInput): Promise<CertificateDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      // Lock the student row so two clerks cannot issue the same leaving certificate at the same moment.
      await tx.$queryRaw`SELECT id FROM students WHERE id = ${input.studentId}::uuid FOR UPDATE`;
      const s = await tx.student.findFirst({
        where: { id: input.studentId, schoolId, deletedAt: null },
        include: { class: { select: { name: true } }, section: { select: { name: true } }, guardians: { include: { guardian: { select: { name: true } } } } },
      });
      if (!s) throw notFound('Student not found');
      const issuedOn = input.issuedOn ?? this.today();
      if (issuedOn > this.today()) throw badRequest('The issue date cannot be in the future');
      const e = eligibility(input.type, s.status as StudentStatusValue, s.leftAt ? dayText(s.leftAt) : null, issuedOn);
      if (!e.ok) {
        if (e.reason === 'NOT_ACTIVE') throw conflict('A bonafide certificate is only for a student who is studying here now');
        if (e.reason === 'STILL_ACTIVE') throw conflict('Withdraw or transfer the student first, then issue the leaving certificate');
        if (e.reason === 'NO_LEAVING_DATE') throw conflict('This student has no leaving date');
        throw badRequest('The leaving certificate cannot be dated before the day the student left');
      }
      if (oneAtATime(input.type)) {
        const existing = await tx.certificate.findFirst({ where: { schoolId, studentId: s.id, type: input.type, voidedAt: null }, select: { certNo: true } });
        if (existing) throw conflict(`A leaving certificate (${existing.certNo}) already exists. Reprint it, or void it first`);
      }
      const c = await tx.schoolCounter.upsert({ where: { schoolId_key: { schoolId, key: CERT_COUNTER } }, update: { value: { increment: 1 } }, create: { schoolId, key: CERT_COUNTER, value: 1 } });
      const father = s.guardians.find((g) => g.relation === 'FATHER');
      const r = await tx.certificate.create({
        data: {
          schoolId, certNo: certNo(c.value), type: input.type, studentId: s.id, studentName: `${s.firstName} ${s.lastName}`, gender: s.gender, fatherName: father ? father.guardian.name : null,
          admissionNo: s.admissionNo, className: s.class.name, sectionName: s.section ? s.section.name : null, dateOfBirth: s.dateOfBirth, admissionDate: s.admissionDate, leftAt: s.leftAt,
          issuedOn: toDate(issuedOn), purpose: blank(input.purpose), remarks: blank(input.remarks), issuedById: actorId,
        },
      });
      await this.audit(tx, schoolId, actorId, 'certificate.issue', r.id, { certNo: r.certNo, type: r.type, studentId: s.id });
      return this.detail(tx, schoolId, r.id);
    });
  }

  void(schoolId: string, actorId: string, id: string, reason: string): Promise<CertificateDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM certificates WHERE id = ${id}::uuid FOR UPDATE`;
      const r = await tx.certificate.findFirst({ where: { id, schoolId } });
      if (!r) throw notFound('Certificate not found');
      if (r.voidedAt !== null) throw conflict('This certificate is already void');
      await tx.certificate.update({ where: { id }, data: { voidedAt: this.now(), voidReason: reason.trim(), voidedById: actorId } });
      await this.audit(tx, schoolId, actorId, 'certificate.void', id, { certNo: r.certNo, reason: reason.trim() });
      return this.detail(tx, schoolId, id);
    });
  }
}
