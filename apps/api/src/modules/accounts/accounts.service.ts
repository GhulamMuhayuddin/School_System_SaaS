import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { DEFAULT_CATEGORIES, counterKey, formatEntryNo, monthlySeries, summarize, type LedgerKind } from './accounts.logic';
import type {
  AccountSummary, AccountsApi, CategoryDto, EntryDto, EntryFilter, EntryInput, EntryList, PaymentMethod,
} from './accounts.types';

type Tx = Prisma.TransactionClient;
const LIST_LIMIT = 500;
const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);
const dayText = (d: Date): string => d.toISOString().slice(0, 10);
const nextDay = (s: string): Date => new Date(toDate(s).getTime() + 86_400_000);

type EntryRow = Prisma.AccountEntryGetPayload<{ include: { category: { select: { id: true; name: true } } } }>;
const entryInclude = { category: { select: { id: true, name: true } } } as const;

const toEntryDto = (e: EntryRow): EntryDto => ({
  id: e.id, entryNo: e.entryNo, kind: e.kind as LedgerKind, category: { id: e.category.id, name: e.category.name }, amount: e.amount,
  method: e.method as PaymentMethod, entryDate: dayText(e.entryDate), description: e.description, party: e.party, reference: e.reference,
  voided: e.voidedAt !== null, voidReason: e.voidReason, createdAt: e.createdAt.toISOString(),
});
const toCategoryDto = (c: { id: string; kind: string; name: string; isActive: boolean }): CategoryDto => ({ id: c.id, kind: c.kind as LedgerKind, name: c.name, isActive: c.isActive });

/** Accounts ledger: income and expenses other than student fees. Every query runs under Row Level Security. */
export class AccountsService implements AccountsApi {
  constructor(private readonly prisma: PrismaClient, private readonly now: () => Date = () => new Date()) {}

  private today(): string { return dayText(this.now()); }

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string | null, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: 'account', entityId, metadata } });
  }

  /** Reserves the next number of a school counter (the upsert locks the counter row until the transaction ends). */
  private async reserve(tx: Tx, schoolId: string, key: string): Promise<number> {
    const c = await tx.schoolCounter.upsert({
      where: { schoolId_key: { schoolId, key } }, update: { value: { increment: 1 } }, create: { schoolId, key, value: 1 },
    });
    return c.value;
  }

  // ---- categories ----------------------------------------------------------------------------------------------------
  categories(schoolId: string, kind: LedgerKind | undefined): Promise<CategoryDto[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const rows = await tx.accountCategory.findMany({ where: { schoolId, ...(kind ? { kind } : {}) }, orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
      return rows.map(toCategoryDto);
    });
  }

  createCategory(schoolId: string, actorId: string, input: { kind: LedgerKind; name: string }): Promise<CategoryDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const clash = await tx.accountCategory.findFirst({ where: { schoolId, kind: input.kind, name: { equals: input.name, mode: 'insensitive' } }, select: { id: true } });
      if (clash) throw conflict('A category with this name already exists');
      const c = await tx.accountCategory.create({ data: { schoolId, kind: input.kind, name: input.name } });
      await this.audit(tx, schoolId, actorId, 'account.category.create', c.id, { kind: input.kind, name: input.name });
      return toCategoryDto(c);
    });
  }

  updateCategory(schoolId: string, actorId: string, id: string, patch: { name?: string; isActive?: boolean }): Promise<CategoryDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const cat = await tx.accountCategory.findFirst({ where: { id, schoolId } });
      if (!cat) throw notFound('Category not found');
      if (patch.name) {
        const clash = await tx.accountCategory.findFirst({ where: { schoolId, kind: cat.kind, id: { not: id }, name: { equals: patch.name, mode: 'insensitive' } }, select: { id: true } });
        if (clash) throw conflict('A category with this name already exists');
      }
      const c = await tx.accountCategory.update({ where: { id }, data: { name: patch.name, isActive: patch.isActive } });
      await this.audit(tx, schoolId, actorId, 'account.category.update', id, { name: patch.name ?? null, isActive: patch.isActive ?? null });
      return toCategoryDto(c);
    });
  }

  /** Adds the common categories that do not exist yet (names compared without letter case). Safe to run twice. */
  addDefaultCategories(schoolId: string, actorId: string): Promise<{ created: number }> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const have = await tx.accountCategory.findMany({ where: { schoolId }, select: { kind: true, name: true } });
      const key = (kind: string, name: string) => `${kind}:${name.toLowerCase()}`;
      const taken = new Set(have.map((c) => key(c.kind, c.name)));
      const missing = DEFAULT_CATEGORIES.filter((d) => !taken.has(key(d.kind, d.name)));
      if (missing.length > 0) {
        await tx.accountCategory.createMany({ data: missing.map((d) => ({ schoolId, kind: d.kind, name: d.name })) });
        await this.audit(tx, schoolId, actorId, 'account.category.defaults', null, { created: missing.length });
      }
      return { created: missing.length };
    });
  }

  // ---- entries -------------------------------------------------------------------------------------------------------
  private where(schoolId: string, f: EntryFilter): Prisma.AccountEntryWhereInput {
    const q = f.q?.trim();
    return {
      schoolId,
      ...(f.kind ? { kind: f.kind } : {}),
      ...(f.categoryId ? { categoryId: f.categoryId } : {}),
      ...(f.method ? { method: f.method } : {}),
      ...(f.includeVoided ? {} : { voidedAt: null }),
      ...(f.from || f.to ? { entryDate: { ...(f.from ? { gte: toDate(f.from) } : {}), ...(f.to ? { lte: toDate(f.to) } : {}) } } : {}),
      ...(q ? { OR: [
        { description: { contains: q, mode: 'insensitive' } }, { party: { contains: q, mode: 'insensitive' } },
        { reference: { contains: q, mode: 'insensitive' } }, { entryNo: { contains: q, mode: 'insensitive' } },
      ] } : {}),
    };
  }

  listEntries(schoolId: string, filter: EntryFilter): Promise<EntryList> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const rows = await tx.accountEntry.findMany({
        where: this.where(schoolId, filter), include: entryInclude, orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }], take: LIST_LIMIT + 1,
      });
      // Totals always cover EVERY matching non-voided entry, not only the rows returned.
      const sums = await tx.accountEntry.groupBy({ by: ['kind'], where: this.where(schoolId, { ...filter, includeVoided: false }), _sum: { amount: true } });
      const total = (k: LedgerKind): number => sums.find((s) => s.kind === k)?._sum.amount ?? 0;
      return { entries: rows.slice(0, LIST_LIMIT).map(toEntryDto), income: total('INCOME'), expense: total('EXPENSE'), truncated: rows.length > LIST_LIMIT };
    });
  }

  createEntry(schoolId: string, actorId: string, input: EntryInput): Promise<EntryDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      if (input.entryDate > this.today()) throw badRequest('The date cannot be in the future');
      const cat = await tx.accountCategory.findFirst({ where: { id: input.categoryId, schoolId } });
      if (!cat) throw notFound('Category not found');
      if (cat.kind !== input.kind) throw badRequest(`This category is for ${cat.kind === 'INCOME' ? 'income' : 'expenses'}`);
      if (!cat.isActive) throw badRequest('This category is inactive');
      const n = await this.reserve(tx, schoolId, counterKey(input.kind));
      const e = await tx.accountEntry.create({
        data: {
          schoolId, entryNo: formatEntryNo(input.kind, n), kind: input.kind, categoryId: cat.id, amount: input.amount, method: input.method,
          entryDate: toDate(input.entryDate), description: input.description, party: input.party ?? null, reference: input.reference ?? null, createdById: actorId,
        },
        include: entryInclude,
      });
      await this.audit(tx, schoolId, actorId, 'account.entry.create', e.id, { entryNo: e.entryNo, kind: input.kind, amount: input.amount, category: cat.name });
      return toEntryDto(e);
    });
  }

  getEntry(schoolId: string, id: string): Promise<EntryDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const e = await tx.accountEntry.findFirst({ where: { id, schoolId }, include: entryInclude });
      if (!e) throw notFound('Entry not found');
      return toEntryDto(e);
    });
  }

  voidEntry(schoolId: string, actorId: string, id: string, reason: string): Promise<EntryDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const found = await tx.accountEntry.findFirst({ where: { id, schoolId }, select: { id: true } });
      if (!found) throw notFound('Entry not found');
      // One conditional update: of two simultaneous voids only one changes a row.
      const done = await tx.accountEntry.updateMany({ where: { id, schoolId, voidedAt: null }, data: { voidedAt: this.now(), voidReason: reason, voidedById: actorId } });
      if (done.count === 0) throw conflict('This entry is already voided');
      const e = await tx.accountEntry.findFirstOrThrow({ where: { id, schoolId }, include: entryInclude });
      await this.audit(tx, schoolId, actorId, 'account.entry.void', id, { entryNo: e.entryNo, amount: e.amount, reason });
      return toEntryDto(e);
    });
  }

  // ---- reports -------------------------------------------------------------------------------------------------------
  summary(schoolId: string, from: string | undefined, to: string | undefined): Promise<AccountSummary> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const today = this.today();
      const start = from ?? `${today.slice(0, 7)}-01`;
      const end = to ?? today;
      const fee = await tx.feePayment.aggregate({ where: { schoolId, voidedAt: null, paidAt: { gte: toDate(start), lt: nextDay(end) } }, _sum: { amount: true } });
      const entries = await tx.accountEntry.findMany({ where: { schoolId, voidedAt: null, entryDate: { gte: toDate(start), lte: toDate(end) } }, select: { kind: true, categoryId: true, amount: true } });
      const cats = await tx.accountCategory.findMany({ where: { schoolId, id: { in: [...new Set(entries.map((e) => e.categoryId))] } }, select: { id: true, name: true } });
      const s = summarize(entries.map((e) => ({ kind: e.kind as LedgerKind, categoryId: e.categoryId, amount: e.amount })), new Map(cats.map((c) => [c.id, c.name])), fee._sum.amount ?? 0);
      return { from: start, to: end, ...s };
    });
  }

  monthly(schoolId: string, year: number | undefined): Promise<{ year: number; months: import('./accounts.logic').MonthRow[] }> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const y = year ?? Number(this.today().slice(0, 4));
      const start = toDate(`${y}-01-01`);
      const end = toDate(`${y + 1}-01-01`);
      const fee = await tx.feePayment.findMany({ where: { schoolId, voidedAt: null, paidAt: { gte: start, lt: end } }, select: { amount: true, paidAt: true } });
      const entries = await tx.accountEntry.findMany({ where: { schoolId, voidedAt: null, entryDate: { gte: start, lt: end } }, select: { kind: true, amount: true, entryDate: true } });
      return {
        year: y,
        months: monthlySeries(y, fee.map((f) => ({ date: f.paidAt.toISOString(), amount: f.amount })), entries.map((e) => ({ date: dayText(e.entryDate), kind: e.kind as LedgerKind, amount: e.amount }))),
      };
    });
  }
}
