import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { conflict, notFound } from '../../utils/errors';
import type { StaffApi, StaffDetail, StaffInput, StaffListItem, StaffListResult, StaffCategory, StaffStatus, UpdateStaffInput, Gender } from './staff.types';

type Tx = Prisma.TransactionClient;
const day = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);

type Row = {
  id: string; employeeNo: string; firstName: string; lastName: string; gender: Gender; category: StaffCategory; designation: string;
  phone: string; status: StaffStatus; userId: string | null; email: string | null; cnic: string | null; address: string | null;
  dateOfBirth: Date | null; qualification: string | null; joiningDate: Date; leftAt: Date | null; leftReason: string | null; notes: string | null;
  createdAt: Date; user: { id: string; email: string; role: { name: string } } | null;
};
const include = { user: { select: { id: true, email: true, role: { select: { name: true } } } } } as const;

const item = (r: Row): StaffListItem => ({
  id: r.id, employeeNo: r.employeeNo, firstName: r.firstName, lastName: r.lastName, gender: r.gender, category: r.category,
  designation: r.designation, phone: r.phone, status: r.status, hasAccount: r.userId !== null,
});
const detailOf = (r: Row): StaffDetail => ({
  ...item(r), email: r.email, cnic: r.cnic, address: r.address, dateOfBirth: day(r.dateOfBirth), qualification: r.qualification,
  joiningDate: day(r.joiningDate)!, leftAt: day(r.leftAt), leftReason: r.leftReason, notes: r.notes, createdAt: r.createdAt.toISOString(),
  account: r.user ? { id: r.user.id, email: r.user.email, role: r.user.role.name } : null,
});

/** Every query runs in tenantTransaction (Row Level Security) and also filters by schoolId explicitly. */
export class StaffService implements StaffApi {
  constructor(private readonly prisma: PrismaClient) {}

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: 'staff', entityId, metadata } });
  }

  private async find(tx: Tx, schoolId: string, id: string): Promise<Row> {
    const r = await tx.staff.findFirst({ where: { id, schoolId, deletedAt: null }, include });
    if (!r) throw notFound('Staff member not found');
    return r as unknown as Row;
  }

  /** Next free employee number "E-001", skipping numbers that were typed by hand. */
  private async nextNo(tx: Tx, schoolId: string): Promise<string> {
    for (let i = 0; i < 1000; i++) {
      const c = await tx.schoolCounter.upsert({
        where: { schoolId_key: { schoolId, key: 'employee_no' } }, update: { value: { increment: 1 } }, create: { schoolId, key: 'employee_no', value: 1 },
      });
      const no = `E-${String(c.value).padStart(3, '0')}`;
      if (!(await tx.staff.findFirst({ where: { schoolId, employeeNo: no }, select: { id: true } }))) return no;
    }
    throw conflict('Could not generate an employee number');
  }

  list(schoolId: string, filter: { q?: string; category?: StaffCategory; status?: StaffStatus; limit: number }): Promise<StaffListResult> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const where: Prisma.StaffWhereInput = { schoolId, deletedAt: null };
      if (filter.category) where.category = filter.category;
      if (filter.status) where.status = filter.status;
      if (filter.q) {
        where.OR = [
          { firstName: { contains: filter.q, mode: 'insensitive' } }, { lastName: { contains: filter.q, mode: 'insensitive' } },
          { employeeNo: { contains: filter.q, mode: 'insensitive' } }, { designation: { contains: filter.q, mode: 'insensitive' } },
          { phone: { contains: filter.q } },
        ];
      }
      const [rows, total] = await Promise.all([
        tx.staff.findMany({ where, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }], take: filter.limit, include }),
        tx.staff.count({ where }),
      ]);
      return { staff: (rows as unknown as Row[]).map(item), total };
    });
  }

  get(schoolId: string, id: string): Promise<StaffDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => detailOf(await this.find(tx, schoolId, id)));
  }

  create(schoolId: string, input: StaffInput, actorId: string): Promise<StaffDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      let employeeNo = input.employeeNo;
      if (employeeNo) {
        if (await tx.staff.findFirst({ where: { schoolId, employeeNo }, select: { id: true } })) throw conflict('This employee number is already used', { field: 'employeeNo' });
      } else employeeNo = await this.nextNo(tx, schoolId);
      const row = await tx.staff.create({
        data: {
          schoolId, employeeNo, firstName: input.firstName, lastName: input.lastName, gender: input.gender,
          dateOfBirth: input.dateOfBirth ? toDate(input.dateOfBirth) : null, phone: input.phone, email: input.email ?? null, cnic: input.cnic ?? null,
          address: input.address ?? null, category: input.category, designation: input.designation, qualification: input.qualification ?? null,
          joiningDate: toDate(input.joiningDate), notes: input.notes ?? null,
        },
      });
      await this.audit(tx, schoolId, actorId, 'staff.create', row.id, { employeeNo, category: input.category });
      return detailOf(await this.find(tx, schoolId, row.id));
    });
  }

  update(schoolId: string, id: string, input: UpdateStaffInput, actorId: string): Promise<StaffDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await this.find(tx, schoolId, id);
      const { dateOfBirth, joiningDate, ...rest } = input;
      await tx.staff.update({
        where: { id },
        data: {
          ...rest,
          ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth ? toDate(dateOfBirth) : null } : {}),
          ...(joiningDate ? { joiningDate: toDate(joiningDate) } : {}),
        },
      });
      await this.audit(tx, schoolId, actorId, 'staff.update', id, { fields: Object.keys(input) });
      return detailOf(await this.find(tx, schoolId, id));
    });
  }

  leave(schoolId: string, id: string, input: { date: string; reason?: string | null }, actorId: string): Promise<StaffDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const s = await this.find(tx, schoolId, id);
      if (s.status !== 'ACTIVE') throw conflict('This staff member has already left');
      await tx.staff.update({ where: { id }, data: { status: 'LEFT', leftAt: toDate(input.date), leftReason: input.reason ?? null } });
      // A login without a job must not keep working: close it and end its sessions.
      if (s.userId) {
        await tx.user.update({ where: { id: s.userId }, data: { status: 'INACTIVE' } });
        await tx.refreshToken.updateMany({ where: { userId: s.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await this.audit(tx, schoolId, actorId, 'staff.leave', id, { reason: input.reason ?? null, loginClosed: s.userId !== null });
      return detailOf(await this.find(tx, schoolId, id));
    });
  }

  reinstate(schoolId: string, id: string, actorId: string): Promise<StaffDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const s = await this.find(tx, schoolId, id);
      if (s.status === 'ACTIVE') throw conflict('This staff member is already active');
      await tx.staff.update({ where: { id }, data: { status: 'ACTIVE', leftAt: null, leftReason: null } });
      // The login is NOT re-opened automatically: an administrator re-activates it under Users & roles.
      await this.audit(tx, schoolId, actorId, 'staff.reinstate', id);
      return detailOf(await this.find(tx, schoolId, id));
    });
  }

  remove(schoolId: string, id: string, actorId: string): Promise<void> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const s = await this.find(tx, schoolId, id);
      if (s.status === 'ACTIVE' && s.userId) throw conflict('Mark this staff member as left first so the login is closed');
      await tx.staff.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit(tx, schoolId, actorId, 'staff.delete', id, { employeeNo: s.employeeNo });
    });
  }
}
