import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { badRequest, conflict, notFound } from '../../utils/errors';
import type { StudentEnrolment, StudentDetail } from '../students/students.types';
import type {
  AdmissionStatus, AdmissionsApi, ApplicationDetail, ApplicationInput, ApplicationListItem, ApproveInput,
} from './admissions.types';

type Tx = Prisma.TransactionClient;
const day = (d: Date): string => d.toISOString().slice(0, 10);
const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);

type Row = {
  id: string; applicationNo: string; status: AdmissionStatus; firstName: string; lastName: string; gender: ApplicationListItem['gender'];
  appliedClass: { id: string; name: string }; guardianName: string; guardianPhone: string; applicationDate: Date;
  dateOfBirth: Date; bloodGroup: string | null; previousSchool: string | null; address: string | null; notes: string | null;
  guardianEmail: string | null; guardianRelation: ApplicationDetail['guardianRelation']; guardianOccupation: string | null;
  decidedAt: Date | null; decidedById: string | null; decisionNote: string | null; createdAt: Date;
  student: { id: string; admissionNo: string } | null;
};
const include = { appliedClass: { select: { id: true, name: true } }, student: { select: { id: true, admissionNo: true } } } as const;
const listItem = (r: Row): ApplicationListItem => ({
  id: r.id, applicationNo: r.applicationNo, status: r.status, firstName: r.firstName, lastName: r.lastName, gender: r.gender,
  appliedClass: r.appliedClass, guardianName: r.guardianName, guardianPhone: r.guardianPhone, applicationDate: day(r.applicationDate),
});

export class AdmissionsService implements AdmissionsApi {
  constructor(private readonly prisma: PrismaClient, private readonly students: StudentEnrolment) {}

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: 'admission', entityId, metadata } });
  }

  private async detail(tx: Tx, schoolId: string, id: string): Promise<ApplicationDetail> {
    const r = (await tx.admissionApplication.findFirst({ where: { id, schoolId }, include })) as unknown as Row | null;
    if (!r) throw notFound('Application not found');
    let decidedBy: ApplicationDetail['decidedBy'] = null;
    if (r.decidedById) {
      const u = await tx.user.findFirst({ where: { id: r.decidedById }, select: { id: true, firstName: true, lastName: true } });
      if (u) decidedBy = { id: u.id, name: `${u.firstName} ${u.lastName}` };
    }
    return {
      ...listItem(r), dateOfBirth: day(r.dateOfBirth), bloodGroup: r.bloodGroup, previousSchool: r.previousSchool, address: r.address, notes: r.notes,
      guardianEmail: r.guardianEmail, guardianRelation: r.guardianRelation, guardianOccupation: r.guardianOccupation,
      decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null, decidedBy, decisionNote: r.decisionNote, student: r.student, createdAt: r.createdAt.toISOString(),
    };
  }

  list(schoolId: string, filter: { q?: string; status?: AdmissionStatus; classId?: string; limit: number }) {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const where: Prisma.AdmissionApplicationWhereInput = { schoolId };
      if (filter.status) where.status = filter.status;
      if (filter.classId) where.appliedClassId = filter.classId;
      if (filter.q) {
        where.OR = [
          { firstName: { contains: filter.q, mode: 'insensitive' } }, { lastName: { contains: filter.q, mode: 'insensitive' } },
          { applicationNo: { contains: filter.q, mode: 'insensitive' } }, { guardianName: { contains: filter.q, mode: 'insensitive' } },
          { guardianPhone: { contains: filter.q } },
        ];
      }
      const [rows, total] = await Promise.all([
        tx.admissionApplication.findMany({ where, orderBy: [{ createdAt: 'desc' }], take: Math.min(filter.limit, 2000), include: { appliedClass: { select: { id: true, name: true } } } }),
        tx.admissionApplication.count({ where }),
      ]);
      return { applications: (rows as unknown as Row[]).map(listItem), total };
    });
  }

  get(schoolId: string, id: string): Promise<ApplicationDetail> {
    return tenantTransaction(this.prisma, schoolId, (tx) => this.detail(tx, schoolId, id));
  }

  private async requireClass(tx: Tx, schoolId: string, classId: string): Promise<void> {
    if (!(await tx.schoolClass.findFirst({ where: { id: classId, schoolId }, select: { id: true } }))) throw badRequest('Selected class does not exist');
  }

  private async nextNo(tx: Tx, schoolId: string): Promise<string> {
    const c = await tx.schoolCounter.upsert({
      where: { schoolId_key: { schoolId, key: 'admission_application_no' } },
      update: { value: { increment: 1 } },
      create: { schoolId, key: 'admission_application_no', value: 1 },
    });
    return `APP-${String(c.value).padStart(4, '0')}`;
  }

  create(schoolId: string, input: ApplicationInput, actorId: string): Promise<ApplicationDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await this.requireClass(tx, schoolId, input.appliedClassId);
      const row = await tx.admissionApplication.create({
        data: {
          schoolId, applicationNo: await this.nextNo(tx, schoolId), firstName: input.firstName, lastName: input.lastName, gender: input.gender,
          dateOfBirth: toDate(input.dateOfBirth), bloodGroup: input.bloodGroup ?? null, previousSchool: input.previousSchool ?? null,
          address: input.address ?? null, notes: input.notes ?? null, appliedClassId: input.appliedClassId, guardianName: input.guardianName,
          guardianPhone: input.guardianPhone, guardianEmail: input.guardianEmail ?? null, guardianRelation: input.guardianRelation,
          guardianOccupation: input.guardianOccupation ?? null, applicationDate: toDate(input.applicationDate), createdById: actorId,
        },
      });
      await this.audit(tx, schoolId, actorId, 'admission.create', row.id, { applicationNo: row.applicationNo });
      return this.detail(tx, schoolId, row.id);
    });
  }

  update(schoolId: string, id: string, input: Partial<ApplicationInput>, actorId: string): Promise<ApplicationDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const a = await tx.admissionApplication.findFirst({ where: { id, schoolId }, select: { status: true } });
      if (!a) throw notFound('Application not found');
      if (a.status !== 'PENDING') throw conflict('Only a pending application can be edited');
      if (input.appliedClassId) await this.requireClass(tx, schoolId, input.appliedClassId);
      const { dateOfBirth, applicationDate, ...rest } = input;
      await tx.admissionApplication.update({
        where: { id },
        data: { ...rest, ...(dateOfBirth ? { dateOfBirth: toDate(dateOfBirth) } : {}), ...(applicationDate ? { applicationDate: toDate(applicationDate) } : {}) },
      });
      await this.audit(tx, schoolId, actorId, 'admission.update', id, { fields: Object.keys(input) });
      return this.detail(tx, schoolId, id);
    });
  }

  approve(schoolId: string, id: string, input: ApproveInput, actorId: string): Promise<{ application: ApplicationDetail; student: StudentDetail }> {
    // One transaction: the student, its guardian and the approval are created together or not at all.
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const a = await tx.admissionApplication.findFirst({ where: { id, schoolId } });
      if (!a) throw notFound('Application not found');
      if (a.status !== 'PENDING') throw conflict('This application has already been decided');
      const student = await this.students.createInTx(
        tx, schoolId,
        {
          admissionNo: input.admissionNo, firstName: a.firstName, lastName: a.lastName, gender: a.gender, dateOfBirth: day(a.dateOfBirth),
          bloodGroup: a.bloodGroup, address: a.address, previousSchool: a.previousSchool, notes: a.notes,
          classId: input.classId ?? a.appliedClassId, sectionId: input.sectionId ?? null, admissionDate: input.admissionDate,
          guardians: [{ name: a.guardianName, phone: a.guardianPhone, email: a.guardianEmail, occupation: a.guardianOccupation, relation: a.guardianRelation, isPrimary: true }],
        },
        actorId, { applicationNo: a.applicationNo },
      );
      await tx.admissionApplication.update({ where: { id }, data: { status: 'APPROVED', decidedAt: new Date(), decidedById: actorId, studentId: student.id } });
      await this.audit(tx, schoolId, actorId, 'admission.approve', id, { studentId: student.id, admissionNo: student.admissionNo });
      return { application: await this.detail(tx, schoolId, id), student };
    });
  }

  reject(schoolId: string, id: string, note: string | null, actorId: string): Promise<ApplicationDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const a = await tx.admissionApplication.findFirst({ where: { id, schoolId }, select: { status: true } });
      if (!a) throw notFound('Application not found');
      if (a.status !== 'PENDING') throw conflict('This application has already been decided');
      await tx.admissionApplication.update({ where: { id }, data: { status: 'REJECTED', decidedAt: new Date(), decidedById: actorId, decisionNote: note } });
      await this.audit(tx, schoolId, actorId, 'admission.reject', id, { note });
      return this.detail(tx, schoolId, id);
    });
  }
}
