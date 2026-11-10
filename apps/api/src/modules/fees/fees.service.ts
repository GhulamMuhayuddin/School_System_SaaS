import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { balanceOf, discountFor, formatNo, isOverdue, netAmount, outstandingFromSums, statusFor, type Concession, type VoucherStatusKey } from './fees.logic';
import type {
  ClassStructure, ConcessionDto, DefaulterRow, FeeFrequency, FeeHeadDto, FeeSummary, FeesApi, GenerateInput, GenerateResult, PayInput,
  PaymentDto, PaymentMethod, StructureItem, VoucherDetail, VoucherDto, VoucherFilter,
} from './fees.types';

type Tx = Prisma.TransactionClient;
const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);
const dayText = (d: Date): string => d.toISOString().slice(0, 10);
const fullName = (p: { firstName: string; lastName: string }): string => `${p.firstName} ${p.lastName}`;

const voucherInclude = { student: { select: { id: true, admissionNo: true, firstName: true, lastName: true, section: { select: { name: true } } } } } as const;
type VoucherRow = Prisma.FeeVoucherGetPayload<{ include: typeof voucherInclude }>;

/** Fees: heads, class fee structure, concessions, vouchers and payments. Every query runs under Row Level Security. */
export class FeesService implements FeesApi {
  constructor(private readonly prisma: PrismaClient, private readonly now: () => Date = () => new Date()) {}

  private today(): string { return dayText(this.now()); }

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string | null, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: 'fee', entityId, metadata } });
  }

  private async sessionIdOf(tx: Tx, schoolId: string, given: string | undefined): Promise<{ id: string; name: string }> {
    const s = given
      ? await tx.academicSession.findFirst({ where: { id: given, schoolId }, select: { id: true, name: true } })
      : await tx.academicSession.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true, name: true } });
    if (!s) throw given ? notFound('Academic session not found') : badRequest('Set a current academic session first (Academic setup)');
    return s;
  }

  /** Reserves `count` consecutive numbers of a school counter and returns the first one. */
  private async reserve(tx: Tx, schoolId: string, key: string, count: number): Promise<number> {
    const c = await tx.schoolCounter.upsert({
      where: { schoolId_key: { schoolId, key } }, update: { value: { increment: count } }, create: { schoolId, key, value: count },
    });
    return c.value - count + 1;
  }

  private async classNames(tx: Tx, schoolId: string, ids: string[]): Promise<Map<string, string>> {
    const rows = await tx.schoolClass.findMany({ where: { schoolId, id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private toVoucherDto(v: VoucherRow, classes: Map<string, string>, today: string): VoucherDto {
    const status = v.status as VoucherStatusKey;
    const balance = status === 'CANCELLED' ? 0 : balanceOf(v.totalAmount, v.discountAmount, v.paidAmount);
    return {
      id: v.id, voucherNo: v.voucherNo, period: v.period, dueDate: dayText(v.dueDate), status,
      overdue: status !== 'CANCELLED' && isOverdue(dayText(v.dueDate), today, balance),
      student: { id: v.student.id, admissionNo: v.student.admissionNo, name: fullName(v.student) },
      className: classes.get(v.classId) ?? '', sectionName: v.student.section?.name ?? null,
      totalAmount: v.totalAmount, discountAmount: v.discountAmount, netAmount: netAmount(v.totalAmount, v.discountAmount), paidAmount: v.paidAmount, balance,
    };
  }

  private async voucherDtos(tx: Tx, schoolId: string, rows: VoucherRow[]): Promise<VoucherDto[]> {
    const classes = await this.classNames(tx, schoolId, rows.map((r) => r.classId));
    const today = this.today();
    return rows.map((r) => this.toVoucherDto(r, classes, today));
  }

  private toPaymentDto(p: { id: string; receiptNo: string; voucherId: string; amount: number; method: string; reference: string | null; paidAt: Date; voidedAt: Date | null; voidReason: string | null },
    voucher: { voucherNo: string; period: string }, student: { id: string; admissionNo: string; firstName: string; lastName: string }): PaymentDto {
    return {
      id: p.id, receiptNo: p.receiptNo, voucherId: p.voucherId, voucherNo: voucher.voucherNo, amount: p.amount, method: p.method as PaymentMethod,
      reference: p.reference, paidAt: p.paidAt.toISOString(), voided: p.voidedAt !== null, voidReason: p.voidReason,
      student: { id: student.id, admissionNo: student.admissionNo, name: fullName(student) }, period: voucher.period,
    };
  }

  // ---- fee heads -----------------------------------------------------------------------------------------------------
  heads(schoolId: string): Promise<FeeHeadDto[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const rows = await tx.feeHead.findMany({ where: { schoolId }, orderBy: { name: 'asc' } });
      return rows.map((r) => ({ id: r.id, name: r.name, isActive: r.isActive }));
    });
  }

  createHead(schoolId: string, actorId: string, name: string): Promise<FeeHeadDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const clash = await tx.feeHead.findFirst({ where: { schoolId, name: { equals: name, mode: 'insensitive' } }, select: { id: true } });
      if (clash) throw conflict('A fee head with this name already exists');
      const h = await tx.feeHead.create({ data: { schoolId, name } });
      await this.audit(tx, schoolId, actorId, 'fee.head.create', h.id, { name });
      return { id: h.id, name: h.name, isActive: h.isActive };
    });
  }

  updateHead(schoolId: string, actorId: string, id: string, patch: { name?: string; isActive?: boolean }): Promise<FeeHeadDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const head = await tx.feeHead.findFirst({ where: { id, schoolId } });
      if (!head) throw notFound('Fee head not found');
      if (patch.name) {
        const clash = await tx.feeHead.findFirst({ where: { schoolId, id: { not: id }, name: { equals: patch.name, mode: 'insensitive' } }, select: { id: true } });
        if (clash) throw conflict('A fee head with this name already exists');
      }
      const h = await tx.feeHead.update({ where: { id }, data: { name: patch.name, isActive: patch.isActive } });
      await this.audit(tx, schoolId, actorId, 'fee.head.update', id, { name: patch.name ?? null, isActive: patch.isActive ?? null });
      return { id: h.id, name: h.name, isActive: h.isActive };
    });
  }

  // ---- class fee structure -----------------------------------------------------------------------------------------
  private async structureIn(tx: Tx, schoolId: string, classId: string, session: { id: string; name: string }): Promise<ClassStructure> {
    const rows = await tx.feeStructure.findMany({ where: { schoolId, classId, sessionId: session.id }, include: { feeHead: { select: { name: true } } } });
    const items: StructureItem[] = rows.map((r) => ({ feeHeadId: r.feeHeadId, feeHeadName: r.feeHead.name, amount: r.amount, frequency: r.frequency as FeeFrequency }))
      .sort((a, b) => a.feeHeadName.localeCompare(b.feeHeadName));
    const sum = (f: FeeFrequency) => items.filter((i) => i.frequency === f).reduce((n, i) => n + i.amount, 0);
    return { sessionId: session.id, sessionName: session.name, classId, items, monthlyTotal: sum('MONTHLY'), oneTimeTotal: sum('ONE_TIME') };
  }

  structure(schoolId: string, classId: string, sessionId: string | undefined): Promise<ClassStructure> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      if (!(await tx.schoolClass.findFirst({ where: { id: classId, schoolId }, select: { id: true } }))) throw notFound('Class not found');
      return this.structureIn(tx, schoolId, classId, await this.sessionIdOf(tx, schoolId, sessionId));
    });
  }

  setStructure(schoolId: string, actorId: string, classId: string, sessionId: string | undefined, items: { feeHeadId: string; amount: number; frequency: FeeFrequency }[]): Promise<ClassStructure> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      if (!(await tx.schoolClass.findFirst({ where: { id: classId, schoolId }, select: { id: true } }))) throw notFound('Class not found');
      const session = await this.sessionIdOf(tx, schoolId, sessionId);
      const ids = items.map((i) => i.feeHeadId);
      if (new Set(ids).size !== ids.length) throw badRequest('Each fee head can appear only once per class');
      const heads = await tx.feeHead.findMany({ where: { schoolId, id: { in: ids } }, select: { id: true, isActive: true } });
      if (heads.length !== ids.length) throw badRequest('One of the fee heads does not exist');
      const existing = await tx.feeStructure.findMany({ where: { schoolId, classId, sessionId: session.id }, select: { feeHeadId: true } });
      const existingIds = new Set(existing.map((e) => e.feeHeadId));
      if (heads.some((h) => !h.isActive && !existingIds.has(h.id))) throw badRequest('An inactive fee head cannot be added');
      await tx.feeStructure.deleteMany({ where: { schoolId, classId, sessionId: session.id } });
      if (items.length) await tx.feeStructure.createMany({ data: items.map((i) => ({ schoolId, classId, sessionId: session.id, feeHeadId: i.feeHeadId, amount: i.amount, frequency: i.frequency })) });
      await this.audit(tx, schoolId, actorId, 'fee.structure.set', classId, { sessionId: session.id, items: items.length });
      return this.structureIn(tx, schoolId, classId, session);
    });
  }

  // ---- concessions ---------------------------------------------------------------------------------------------------
  private toConcession(c: { studentId: string; sessionId: string; kind: string; value: number; reason: string | null }): ConcessionDto {
    return { studentId: c.studentId, sessionId: c.sessionId, kind: c.kind as Concession['kind'], value: c.value, reason: c.reason };
  }

  concession(schoolId: string, studentId: string, sessionId: string | undefined): Promise<ConcessionDto | null> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const session = await this.sessionIdOf(tx, schoolId, sessionId);
      const c = await tx.feeConcession.findFirst({ where: { schoolId, studentId, sessionId: session.id } });
      return c ? this.toConcession(c) : null;
    });
  }

  setConcession(schoolId: string, actorId: string, studentId: string, sessionId: string | undefined, input: Concession & { reason?: string | null }): Promise<ConcessionDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      if (!(await tx.student.findFirst({ where: { id: studentId, schoolId, deletedAt: null }, select: { id: true } }))) throw notFound('Student not found');
      const session = await this.sessionIdOf(tx, schoolId, sessionId);
      const data = { kind: input.kind, value: input.value, reason: input.reason ?? null };
      const c = await tx.feeConcession.upsert({
        where: { sessionId_studentId: { sessionId: session.id, studentId } }, update: data, create: { schoolId, sessionId: session.id, studentId, ...data },
      });
      await this.audit(tx, schoolId, actorId, 'fee.concession.set', studentId, { kind: input.kind, value: input.value });
      return this.toConcession(c);
    });
  }

  removeConcession(schoolId: string, actorId: string, studentId: string, sessionId: string | undefined): Promise<void> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const session = await this.sessionIdOf(tx, schoolId, sessionId);
      const r = await tx.feeConcession.deleteMany({ where: { schoolId, studentId, sessionId: session.id } });
      if (r.count === 0) throw notFound('This student has no concession');
      await this.audit(tx, schoolId, actorId, 'fee.concession.remove', studentId);
    });
  }

  // ---- vouchers ------------------------------------------------------------------------------------------------------
  generate(schoolId: string, actorId: string, input: GenerateInput): Promise<GenerateResult> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      if (!(await tx.schoolClass.findFirst({ where: { id: input.classId, schoolId }, select: { id: true } }))) throw notFound('Class not found');
      if (input.sectionId && !(await tx.section.findFirst({ where: { id: input.sectionId, schoolId, classId: input.classId }, select: { id: true } }))) throw notFound('Section not found in this class');
      const session = await this.sessionIdOf(tx, schoolId, input.sessionId);
      const structure = await tx.feeStructure.findMany({ where: { schoolId, classId: input.classId, sessionId: session.id }, include: { feeHead: { select: { name: true, isActive: true } } } });
      const lines = structure.filter((s) => s.frequency === 'MONTHLY' || input.includeOneTime === true);
      if (lines.length === 0) throw badRequest('This class has no fees set for the session. Set the fee structure first.');
      const students = await tx.student.findMany({
        where: { schoolId, classId: input.classId, status: 'ACTIVE', deletedAt: null, ...(input.sectionId ? { sectionId: input.sectionId } : {}) },
        select: { id: true }, orderBy: { admissionNo: 'asc' },
      });
      const have = await tx.feeVoucher.findMany({ where: { schoolId, sessionId: session.id, period: input.period, studentId: { in: students.map((s) => s.id) } }, select: { studentId: true } });
      const haveSet = new Set(have.map((h) => h.studentId));
      const todo = students.filter((s) => !haveSet.has(s.id));
      const concessions = await tx.feeConcession.findMany({ where: { schoolId, sessionId: session.id, studentId: { in: todo.map((s) => s.id) } } });
      const concessionOf = new Map<string, Concession>(concessions.map((c) => [c.studentId, { kind: c.kind as Concession["kind"], value: c.value }]));
      const subtotal = lines.reduce((n, l) => n + l.amount, 0);
      // Transport (Phase 13B): students on a priced route get one extra line. Concessions apply to the school fees only, not to transport.
      const rideOf = new Map<string, { name: string; fee: number }>();
      if (input.includeTransport && todo.length > 0) {
        const rides = await tx.transportAssignment.findMany({
          where: { schoolId, studentId: { in: todo.map((s) => s.id) }, route: { monthlyFee: { gt: 0 } } }, select: { studentId: true, route: { select: { name: true, monthlyFee: true } } },
        });
        for (const r of rides) rideOf.set(r.studentId, { name: r.route.name, fee: r.route.monthlyFee });
      }
      // Hostel (Phase 13C): students living in a priced room get one more line, also outside the concession.
      const stayOf = new Map<string, { name: string; fee: number }>();
      if (input.includeHostel && todo.length > 0) {
        const stays = await tx.hostelAllocation.findMany({
          where: { schoolId, studentId: { in: todo.map((s) => s.id) }, room: { monthlyFee: { gt: 0 } } }, select: { studentId: true, room: { select: { roomNo: true, monthlyFee: true, hostel: { select: { name: true } } } } },
        });
        for (const x of stays) stayOf.set(x.studentId, { name: `${x.room.hostel.name} ${x.room.roomNo}`, fee: x.room.monthlyFee });
      }
      let totalBilled = 0;
      if (todo.length > 0) {
        const first = await this.reserve(tx, schoolId, 'fee_voucher_no', todo.length);
        for (const [i, s] of todo.entries()) {
          const discount = discountFor(subtotal, concessionOf.get(s.id) ?? null);
          const ride = rideOf.get(s.id);
          const stay = stayOf.get(s.id);
          const total = subtotal + (ride?.fee ?? 0) + (stay?.fee ?? 0);
          const v = await tx.feeVoucher.create({
            data: {
              schoolId, voucherNo: formatNo('V', first + i), studentId: s.id, sessionId: session.id, classId: input.classId, period: input.period, dueDate: toDate(input.dueDate),
              totalAmount: total, discountAmount: discount, paidAmount: 0, status: statusFor(total, discount, 0) === 'PAID' ? 'PAID' : 'UNPAID', createdById: actorId,
            },
          });
          await tx.feeVoucherItem.createMany({
            data: [
              ...lines.map((l) => ({ schoolId, voucherId: v.id, feeHeadId: l.feeHeadId, description: l.feeHead.name, amount: l.amount })),
              ...(ride ? [{ schoolId, voucherId: v.id, feeHeadId: null, description: `Transport - ${ride.name}`, amount: ride.fee }] : []),
              ...(stay ? [{ schoolId, voucherId: v.id, feeHeadId: null, description: `Hostel - ${stay.name}`, amount: stay.fee }] : []),
            ],
          });
          totalBilled += netAmount(total, discount);
        }
      }
      await this.audit(tx, schoolId, actorId, 'fee.voucher.generate', input.classId, { period: input.period, created: todo.length, skipped: haveSet.size });
      return { created: todo.length, skippedExisting: haveSet.size, students: students.length, totalBilled };
    });
  }

  listVouchers(schoolId: string, f: VoucherFilter): Promise<VoucherDto[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const where: Prisma.FeeVoucherWhereInput = {
        schoolId, ...(f.classId ? { classId: f.classId } : {}), ...(f.status ? { status: f.status } : {}), ...(f.period ? { period: f.period } : {}), ...(f.studentId ? { studentId: f.studentId } : {}),
        ...(f.sectionId || f.q ? {
          student: {
            ...(f.sectionId ? { sectionId: f.sectionId } : {}),
            ...(f.q ? { OR: [{ admissionNo: { contains: f.q, mode: 'insensitive' as const } }, { firstName: { contains: f.q, mode: 'insensitive' as const } }, { lastName: { contains: f.q, mode: 'insensitive' as const } }] } : {}),
          },
        } : {}),
        ...(f.overdue ? { dueDate: { lt: toDate(this.today()) }, status: { in: ['UNPAID', 'PARTIAL'] as ('UNPAID' | 'PARTIAL')[] } } : {}),
      };
      const rows = await tx.feeVoucher.findMany({ where, include: voucherInclude, orderBy: [{ dueDate: 'desc' }, { voucherNo: 'desc' }], take: 500 });
      return this.voucherDtos(tx, schoolId, rows);
    });
  }

  private async detailIn(tx: Tx, schoolId: string, id: string): Promise<VoucherDetail> {
    const v = await tx.feeVoucher.findFirst({ where: { id, schoolId }, include: { ...voucherInclude, items: { orderBy: { createdAt: 'asc' } }, payments: { orderBy: { paidAt: 'asc' } } } });
    if (!v) throw notFound('Voucher not found');
    const [dto] = await this.voucherDtos(tx, schoolId, [v]);
    return {
      ...dto!, cancelReason: v.cancelReason, items: v.items.map((i) => ({ id: i.id, description: i.description, amount: i.amount })),
      payments: v.payments.map((p) => this.toPaymentDto(p, v, v.student)),
    };
  }

  getVoucher(schoolId: string, id: string): Promise<VoucherDetail> {
    return tenantTransaction(this.prisma, schoolId, (tx) => this.detailIn(tx, schoolId, id));
  }

  private lock(tx: Tx, id: string): Promise<unknown> {
    return tx.$queryRaw`SELECT id FROM fee_vouchers WHERE id = ${id}::uuid FOR UPDATE`;
  }

  cancelVoucher(schoolId: string, actorId: string, id: string, reason: string): Promise<VoucherDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await this.lock(tx, id);
      const v = await tx.feeVoucher.findFirst({ where: { id, schoolId } });
      if (!v) throw notFound('Voucher not found');
      if (v.status === 'CANCELLED') throw conflict('This voucher is already cancelled');
      if (v.paidAmount > 0) throw conflict('This voucher has payments. Void the receipts first.');
      await tx.feeVoucher.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason } });
      await this.audit(tx, schoolId, actorId, 'fee.voucher.cancel', id, { reason });
      return this.detailIn(tx, schoolId, id);
    });
  }

  // ---- payments ------------------------------------------------------------------------------------------------------
  pay(schoolId: string, actorId: string, voucherId: string, input: PayInput): Promise<PaymentDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await this.lock(tx, voucherId);
      const v = await tx.feeVoucher.findFirst({ where: { id: voucherId, schoolId }, include: voucherInclude });
      if (!v) throw notFound('Voucher not found');
      if (v.status === 'CANCELLED') throw conflict('This voucher is cancelled');
      const balance = balanceOf(v.totalAmount, v.discountAmount, v.paidAmount);
      if (balance === 0) throw conflict('This voucher is already fully paid');
      if (input.amount > balance) throw badRequest(`The amount is more than the balance (${balance})`, { code: 'OVERPAY', balance });
      const no = await this.reserve(tx, schoolId, 'fee_receipt_no', 1);
      const p = await tx.feePayment.create({
        data: {
          schoolId, receiptNo: formatNo('R', no), voucherId, studentId: v.studentId, amount: input.amount, method: input.method,
          reference: input.reference ?? null, paidAt: input.paidAt ? new Date(input.paidAt) : this.now(), receivedById: actorId,
        },
      });
      const paid = v.paidAmount + input.amount;
      await tx.feeVoucher.update({ where: { id: voucherId }, data: { paidAmount: paid, status: statusFor(v.totalAmount, v.discountAmount, paid) } });
      await this.audit(tx, schoolId, actorId, 'fee.payment.create', p.id, { receiptNo: p.receiptNo, amount: input.amount });
      return this.toPaymentDto(p, v, v.student);
    });
  }

  getPayment(schoolId: string, id: string): Promise<PaymentDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const p = await tx.feePayment.findFirst({ where: { id, schoolId }, include: { voucher: true, student: true } });
      if (!p) throw notFound('Receipt not found');
      return this.toPaymentDto(p, p.voucher, p.student);
    });
  }

  voidPayment(schoolId: string, actorId: string, id: string, reason: string): Promise<PaymentDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const found = await tx.feePayment.findFirst({ where: { id, schoolId }, select: { voucherId: true } });
      if (!found) throw notFound('Receipt not found');
      await this.lock(tx, found.voucherId);
      const p = await tx.feePayment.findFirst({ where: { id, schoolId }, include: { voucher: true, student: true } });
      if (!p) throw notFound('Receipt not found');
      if (p.voidedAt) throw conflict('This receipt is already voided');
      const paid = Math.max(0, p.voucher.paidAmount - p.amount);
      await tx.feePayment.update({ where: { id }, data: { voidedAt: this.now(), voidReason: reason, voidedById: actorId } });
      await tx.feeVoucher.update({ where: { id: p.voucherId }, data: { paidAmount: paid, status: p.voucher.status === 'CANCELLED' ? 'CANCELLED' : statusFor(p.voucher.totalAmount, p.voucher.discountAmount, paid) } });
      await this.audit(tx, schoolId, actorId, 'fee.payment.void', id, { receiptNo: p.receiptNo, amount: p.amount, reason });
      return this.toPaymentDto({ ...p, voidedAt: this.now(), voidReason: reason }, p.voucher, p.student);
    });
  }

  // ---- reports -------------------------------------------------------------------------------------------------------
  summary(schoolId: string, from: string | undefined, to: string | undefined): Promise<FeeSummary> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const today = this.today();
      const start = from ?? `${today.slice(0, 7)}-01`;
      const end = to ?? today;
      // The database adds things up; nothing here loads every payment or every voucher of the school.
      const paid = await tx.feePayment.groupBy({
        by: ['method'], where: { schoolId, voidedAt: null, paidAt: { gte: toDate(start), lt: new Date(toDate(end).getTime() + 86_400_000) } }, _sum: { amount: true }, _count: { _all: true },
      });
      const live = { schoolId, status: { not: 'CANCELLED' as const } };
      const sums = { totalAmount: true, discountAmount: true, paidAmount: true } as const;
      const [everything, pastDue] = await Promise.all([
        tx.feeVoucher.aggregate({ where: live, _sum: sums }),
        tx.feeVoucher.aggregate({ where: { ...live, dueDate: { lt: toDate(today) } }, _sum: sums }),
      ]);
      const asSums = (r: { _sum: { totalAmount: number | null; discountAmount: number | null; paidAmount: number | null } }) => ({ total: r._sum.totalAmount ?? 0, discount: r._sum.discountAmount ?? 0, paid: r._sum.paidAmount ?? 0 });
      const o = outstandingFromSums(asSums(everything), asSums(pastDue));
      return {
        from: start, to: end, collected: paid.reduce((n, g) => n + (g._sum.amount ?? 0), 0), receipts: paid.reduce((n, g) => n + g._count._all, 0),
        byMethod: paid.map((g) => ({ method: g.method as PaymentMethod, amount: g._sum.amount ?? 0 })), billed: o.billed, totalCollected: o.collected, balance: o.balance, overdueBalance: o.overdueBalance,
      };
    });
  }

  defaulters(schoolId: string, classId: string | undefined): Promise<DefaulterRow[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const rows = await tx.feeVoucher.findMany({
        where: { schoolId, status: { in: ['UNPAID', 'PARTIAL'] }, dueDate: { lt: toDate(this.today()) }, ...(classId ? { classId } : {}) },
        include: voucherInclude,
      });
      const classes = await this.classNames(tx, schoolId, rows.map((r) => r.classId));
      const by = new Map<string, DefaulterRow>();
      for (const v of rows) {
        const bal = balanceOf(v.totalAmount, v.discountAmount, v.paidAmount);
        if (bal === 0) continue;
        const due = dayText(v.dueDate);
        const cur = by.get(v.studentId);
        if (cur) { cur.vouchers += 1; cur.balance += bal; if (due < cur.oldestDueDate) cur.oldestDueDate = due; }
        else by.set(v.studentId, { student: { id: v.student.id, admissionNo: v.student.admissionNo, name: fullName(v.student) }, className: classes.get(v.classId) ?? '', sectionName: v.student.section?.name ?? null, vouchers: 1, balance: bal, oldestDueDate: due });
      }
      return [...by.values()].sort((a, b) => b.balance - a.balance);
    });
  }
}
