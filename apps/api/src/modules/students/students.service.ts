import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { badRequest, conflict, notFound } from '../../utils/errors';
import type {
  CreateStudentInput, GuardianInput, GuardianLinkDto, StudentDetail, StudentListItem, StudentListResult, StudentOptions,
  StudentStatus, StudentsApi, UpdateGuardianInput, UpdateStudentInput, WithdrawInput,
} from './students.types';

type Tx = Prisma.TransactionClient;
const day = (d: Date): string => d.toISOString().slice(0, 10);
const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);

type LinkRow = {
  id: string; guardianId: string; relation: GuardianLinkDto['relation']; isPrimary: boolean;
  guardian: { name: string; phone: string; email: string | null; occupation: string | null; address: string | null; userId: string | null };
};
const listSelect = {
  id: true, admissionNo: true, firstName: true, lastName: true, gender: true, status: true,
  class: { select: { id: true, name: true } }, section: { select: { id: true, name: true } },
  guardians: { where: { isPrimary: true }, take: 1, select: { guardian: { select: { name: true, phone: true } } } },
} as const;
type ListRow = {
  id: string; admissionNo: string; firstName: string; lastName: string; gender: StudentListItem['gender']; status: StudentStatus;
  class: { id: string; name: string }; section: { id: string; name: string } | null; guardians: { guardian: { name: string; phone: string } }[];
};
const listItem = (r: ListRow): StudentListItem => ({
  id: r.id, admissionNo: r.admissionNo, firstName: r.firstName, lastName: r.lastName, gender: r.gender, status: r.status,
  class: r.class, section: r.section, primaryGuardian: r.guardians[0]?.guardian ?? null,
});

/** Every query runs in tenantTransaction (Row Level Security) and also filters by schoolId explicitly. */
export class StudentsService implements StudentsApi {
  constructor(private readonly prisma: PrismaClient) {}

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: 'student', entityId, metadata } });
  }

  options(schoolId: string): Promise<StudentOptions> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const classes = await tx.schoolClass.findMany({
        where: { schoolId }, orderBy: [{ level: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, level: true, sections: { orderBy: { name: 'asc' }, select: { id: true, name: true, capacity: true } } },
      });
      return { classes };
    });
  }

  list(schoolId: string, filter: { q?: string; classId?: string; sectionId?: string; status?: StudentStatus; limit: number }): Promise<StudentListResult> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const where: Prisma.StudentWhereInput = { schoolId, deletedAt: null };
      if (filter.status) where.status = filter.status;
      if (filter.classId) where.classId = filter.classId;
      if (filter.sectionId) where.sectionId = filter.sectionId;
      if (filter.q) {
        where.OR = [
          { firstName: { contains: filter.q, mode: 'insensitive' } }, { lastName: { contains: filter.q, mode: 'insensitive' } },
          { admissionNo: { contains: filter.q, mode: 'insensitive' } },
          { guardians: { some: { guardian: { OR: [{ name: { contains: filter.q, mode: 'insensitive' } }, { phone: { contains: filter.q } }] } } } },
        ];
      }
      const [rows, total] = await Promise.all([
        tx.student.findMany({ where, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }], take: Math.min(filter.limit, 2000), select: listSelect }),
        tx.student.count({ where }),
      ]);
      return { students: (rows as unknown as ListRow[]).map(listItem), total };
    });
  }

  private async detail(tx: Tx, schoolId: string, id: string): Promise<StudentDetail> {
    const s = await tx.student.findFirst({
      where: { id, schoolId, deletedAt: null },
      select: {
        ...listSelect, dateOfBirth: true, bloodGroup: true, phone: true, address: true, previousSchool: true, notes: true,
        admissionDate: true, leftAt: true, leftReason: true, createdAt: true, userId: true,
        guardians: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], select: { id: true, guardianId: true, relation: true, isPrimary: true, guardian: true } },
      },
    });
    if (!s) throw notFound('Student not found');
    const row = s as unknown as Omit<ListRow, 'guardians'> & {
      dateOfBirth: Date; bloodGroup: string | null; phone: string | null; address: string | null; previousSchool: string | null; notes: string | null;
      admissionDate: Date; leftAt: Date | null; leftReason: string | null; createdAt: Date; userId: string | null; guardians: LinkRow[];
    };
    const guardians: GuardianLinkDto[] = row.guardians.map((l) => ({
      linkId: l.id, guardianId: l.guardianId, name: l.guardian.name, phone: l.guardian.phone, email: l.guardian.email,
      occupation: l.guardian.occupation, address: l.guardian.address, relation: l.relation, isPrimary: l.isPrimary, hasAccount: l.guardian.userId !== null,
    }));
    // Siblings = other students sharing a guardian.
    const siblingRows = guardians.length
      ? await tx.student.findMany({
          where: { schoolId, deletedAt: null, id: { not: id }, guardians: { some: { guardianId: { in: guardians.map((g) => g.guardianId) } } } },
          select: { id: true, admissionNo: true, firstName: true, lastName: true, class: { select: { name: true } } }, take: 20,
        })
      : [];
    return {
      id: row.id, admissionNo: row.admissionNo, firstName: row.firstName, lastName: row.lastName, gender: row.gender, status: row.status,
      class: row.class, section: row.section, primaryGuardian: guardians.find((g) => g.isPrimary) ?? null,
      dateOfBirth: day(row.dateOfBirth), bloodGroup: row.bloodGroup, phone: row.phone, address: row.address, previousSchool: row.previousSchool,
      notes: row.notes, admissionDate: day(row.admissionDate), leftAt: row.leftAt ? day(row.leftAt) : null, leftReason: row.leftReason,
      createdAt: row.createdAt.toISOString(), guardians, hasAccount: row.userId !== null,
      siblings: siblingRows.map((x) => ({ id: x.id, admissionNo: x.admissionNo, firstName: x.firstName, lastName: x.lastName, class: x.class.name })),
    };
  }

  get(schoolId: string, id: string): Promise<StudentDetail> {
    return tenantTransaction(this.prisma, schoolId, (tx) => this.detail(tx, schoolId, id));
  }

  /** The class must belong to this school, and the section must belong to that class. */
  private async checkPlacement(tx: Tx, schoolId: string, classId: string, sectionId: string | null | undefined): Promise<void> {
    if (!(await tx.schoolClass.findFirst({ where: { id: classId, schoolId }, select: { id: true } }))) throw badRequest('Selected class does not exist');
    if (sectionId && !(await tx.section.findFirst({ where: { id: sectionId, classId, schoolId }, select: { id: true } }))) throw badRequest('Selected section does not belong to the class');
  }

  /** Reuses a guardian of this school with the same phone number (so siblings share one guardian), else creates one. */
  private async resolveGuardian(tx: Tx, schoolId: string, g: GuardianInput): Promise<string> {
    if (g.guardianId) {
      const found = await tx.guardian.findFirst({ where: { id: g.guardianId, schoolId }, select: { id: true } });
      if (!found) throw badRequest('Guardian not found');
      return found.id;
    }
    const existing = await tx.guardian.findFirst({ where: { schoolId, phone: g.phone, name: { equals: g.name, mode: 'insensitive' } }, select: { id: true } });
    if (existing) return existing.id;
    const created = await tx.guardian.create({ data: { schoolId, name: g.name, phone: g.phone, email: g.email ?? null, occupation: g.occupation ?? null, address: g.address ?? null } });
    return created.id;
  }

  private async nextAdmissionNo(tx: Tx, schoolId: string): Promise<string> {
    for (let i = 0; i < 100; i++) {
      const c = await tx.schoolCounter.upsert({
        where: { schoolId_key: { schoolId, key: 'student_admission_no' } },
        update: { value: { increment: 1 } },
        create: { schoolId, key: 'student_admission_no', value: 1 },
      });
      const no = String(c.value).padStart(4, '0');
      // A number typed by hand earlier may equal this one: skip it.
      if (!(await tx.student.findFirst({ where: { schoolId, admissionNo: no }, select: { id: true } }))) return no;
    }
    throw conflict('Could not generate an admission number');
  }

  create(schoolId: string, input: CreateStudentInput, actorId: string): Promise<StudentDetail> {
    return tenantTransaction(this.prisma, schoolId, (tx) => this.createInTx(tx, schoolId, input, actorId));
  }

  /** Enrols a student inside the caller's transaction (also used when an admission application is approved). */
  async createInTx(tx: Tx, schoolId: string, input: CreateStudentInput, actorId: string, auditExtra: Prisma.InputJsonObject = {}): Promise<StudentDetail> {
    {
      await this.checkPlacement(tx, schoolId, input.classId, input.sectionId);
      let admissionNo = input.admissionNo;
      if (admissionNo) {
        if (await tx.student.findFirst({ where: { schoolId, admissionNo }, select: { id: true } })) throw conflict('This admission number is already used', { field: 'admissionNo' });
      } else {
        admissionNo = await this.nextAdmissionNo(tx, schoolId);
      }
      const student = await tx.student.create({
        data: {
          schoolId, admissionNo, firstName: input.firstName, lastName: input.lastName, gender: input.gender, dateOfBirth: toDate(input.dateOfBirth),
          bloodGroup: input.bloodGroup ?? null, phone: input.phone ?? null, address: input.address ?? null, previousSchool: input.previousSchool ?? null,
          notes: input.notes ?? null, classId: input.classId, sectionId: input.sectionId ?? null, admissionDate: toDate(input.admissionDate),
        },
      });
      const primaryIndex = Math.max(0, input.guardians.findIndex((g) => g.isPrimary));
      const seen = new Set<string>();
      for (const [i, g] of input.guardians.entries()) {
        const guardianId = await this.resolveGuardian(tx, schoolId, g);
        if (seen.has(guardianId)) continue; // same person listed twice
        seen.add(guardianId);
        await tx.studentGuardian.create({ data: { schoolId, studentId: student.id, guardianId, relation: g.relation, isPrimary: i === primaryIndex } });
      }
      await this.audit(tx, schoolId, actorId, 'student.create', student.id, { admissionNo, classId: input.classId, ...auditExtra });
      return this.detail(tx, schoolId, student.id);
    }
  }

  update(schoolId: string, id: string, input: UpdateStudentInput, actorId: string): Promise<StudentDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const s = await tx.student.findFirst({ where: { id, schoolId, deletedAt: null }, select: { id: true, classId: true, sectionId: true } });
      if (!s) throw notFound('Student not found');
      const classId = input.classId ?? s.classId;
      // Changing class without choosing a section clears the old section (it belongs to the previous class).
      const sectionId = input.sectionId !== undefined ? input.sectionId : input.classId && input.classId !== s.classId ? null : s.sectionId;
      if (input.classId !== undefined || input.sectionId !== undefined) await this.checkPlacement(tx, schoolId, classId, sectionId);
      const { dateOfBirth, admissionDate, ...rest } = input;
      await tx.student.update({
        where: { id },
        data: { ...rest, sectionId, ...(dateOfBirth ? { dateOfBirth: toDate(dateOfBirth) } : {}), ...(admissionDate ? { admissionDate: toDate(admissionDate) } : {}) },
      });
      await this.audit(tx, schoolId, actorId, 'student.update', id, { fields: Object.keys(input), ...(classId !== s.classId ? { fromClass: s.classId, toClass: classId } : {}) });
      return this.detail(tx, schoolId, id);
    });
  }

  withdraw(schoolId: string, id: string, input: WithdrawInput, actorId: string): Promise<StudentDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const s = await tx.student.findFirst({ where: { id, schoolId, deletedAt: null }, select: { status: true } });
      if (!s) throw notFound('Student not found');
      if (s.status !== 'ACTIVE') throw conflict('Only an enrolled student can be withdrawn');
      await tx.student.update({ where: { id }, data: { status: input.status, leftAt: toDate(input.date), leftReason: input.reason ?? null } });
      await this.audit(tx, schoolId, actorId, `student.${input.status.toLowerCase()}`, id, { reason: input.reason ?? null });
      return this.detail(tx, schoolId, id);
    });
  }

  reinstate(schoolId: string, id: string, actorId: string): Promise<StudentDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const s = await tx.student.findFirst({ where: { id, schoolId, deletedAt: null }, select: { status: true } });
      if (!s) throw notFound('Student not found');
      if (s.status === 'ACTIVE') throw conflict('Student is already enrolled');
      await tx.student.update({ where: { id }, data: { status: 'ACTIVE', leftAt: null, leftReason: null } });
      await this.audit(tx, schoolId, actorId, 'student.reinstate', id);
      return this.detail(tx, schoolId, id);
    });
  }

  remove(schoolId: string, id: string, actorId: string): Promise<void> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const s = await tx.student.findFirst({ where: { id, schoolId, deletedAt: null }, select: { id: true, admissionNo: true } });
      if (!s) throw notFound('Student not found');
      // Soft delete: later modules (fees, attendance, results) keep their history.
      await tx.student.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit(tx, schoolId, actorId, 'student.delete', id, { admissionNo: s.admissionNo });
    });
  }

  private async requireStudent(tx: Tx, schoolId: string, id: string): Promise<void> {
    if (!(await tx.student.findFirst({ where: { id, schoolId, deletedAt: null }, select: { id: true } }))) throw notFound('Student not found');
  }

  addGuardian(schoolId: string, id: string, input: GuardianInput, actorId: string): Promise<StudentDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await this.requireStudent(tx, schoolId, id);
      const guardianId = await this.resolveGuardian(tx, schoolId, input);
      if (await tx.studentGuardian.findFirst({ where: { studentId: id, guardianId }, select: { id: true } })) throw conflict('This guardian is already linked to the student');
      const hasPrimary = (await tx.studentGuardian.count({ where: { studentId: id, isPrimary: true } })) > 0;
      const makePrimary = Boolean(input.isPrimary) || !hasPrimary;
      if (makePrimary) await tx.studentGuardian.updateMany({ where: { studentId: id }, data: { isPrimary: false } });
      await tx.studentGuardian.create({ data: { schoolId, studentId: id, guardianId, relation: input.relation, isPrimary: makePrimary } });
      await this.audit(tx, schoolId, actorId, 'student.guardian.add', id, { guardianId });
      return this.detail(tx, schoolId, id);
    });
  }

  updateGuardian(schoolId: string, id: string, linkId: string, input: UpdateGuardianInput, actorId: string): Promise<StudentDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await this.requireStudent(tx, schoolId, id);
      const link = await tx.studentGuardian.findFirst({ where: { id: linkId, studentId: id, schoolId } });
      if (!link) throw notFound('Guardian link not found');
      const { relation, isPrimary, ...person } = input;
      if (Object.keys(person).length > 0) await tx.guardian.update({ where: { id: link.guardianId }, data: person }); // shared by siblings on purpose: one person, one record
      if (isPrimary === false && link.isPrimary) throw badRequest('Choose another primary guardian instead');
      if (isPrimary) await tx.studentGuardian.updateMany({ where: { studentId: id, id: { not: linkId } }, data: { isPrimary: false } });
      if (relation !== undefined || isPrimary !== undefined) await tx.studentGuardian.update({ where: { id: linkId }, data: { ...(relation ? { relation } : {}), ...(isPrimary ? { isPrimary: true } : {}) } });
      await this.audit(tx, schoolId, actorId, 'student.guardian.update', id, { linkId, fields: Object.keys(input) });
      return this.detail(tx, schoolId, id);
    });
  }

  removeGuardian(schoolId: string, id: string, linkId: string, actorId: string): Promise<StudentDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await this.requireStudent(tx, schoolId, id);
      const link = await tx.studentGuardian.findFirst({ where: { id: linkId, studentId: id, schoolId } });
      if (!link) throw notFound('Guardian link not found');
      const count = await tx.studentGuardian.count({ where: { studentId: id } });
      if (count <= 1) throw badRequest('A student must keep at least one guardian');
      await tx.studentGuardian.delete({ where: { id: linkId } });
      if (link.isPrimary) {
        const next = await tx.studentGuardian.findFirst({ where: { studentId: id }, orderBy: { createdAt: 'asc' } });
        if (next) await tx.studentGuardian.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
      await this.audit(tx, schoolId, actorId, 'student.guardian.remove', id, { linkId });
      return this.detail(tx, schoolId, id);
    });
  }
}
