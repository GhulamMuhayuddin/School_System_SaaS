import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { ITEM_COUNTER, applyStock, isLow, itemCode, stockValue, tidy, type StockKindValue } from './inventory.logic';
import type {
  InventoryApi, InventorySummary, ItemDetail, ItemDto, ItemFilter, ItemInput, ItemPatch, MovementDto, MovementFilter, StockInput,
} from './inventory.types';

type Tx = Prisma.TransactionClient;
const ITEM_LIMIT = 1000;
const MOVE_LIMIT = 300;
const DETAIL_MOVES = 30;
const dayText = (d: Date): string => d.toISOString().slice(0, 10);
const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);

const moveInclude = { item: { select: { id: true, code: true, name: true, unit: true } } } as const;
type MoveRow = Prisma.InventoryMovementGetPayload<{ include: typeof moveInclude }>;

const itemDto = (i: { id: string; code: string; name: string; category: string | null; unit: string; quantity: number; reorderLevel: number; unitCost: number; location: string | null; notes: string | null; active: boolean }): ItemDto => ({
  id: i.id, code: i.code, name: i.name, category: i.category, unit: i.unit, quantity: i.quantity, reorderLevel: i.reorderLevel, unitCost: i.unitCost,
  value: stockValue(i.quantity, i.unitCost), low: isLow(i.quantity, i.reorderLevel), location: i.location, notes: i.notes, active: i.active,
});
const moveDto = (m: MoveRow): MovementDto => ({
  id: m.id, item: m.item, kind: m.kind as StockKindValue, delta: m.delta, balanceAfter: m.balanceAfter, unitCost: m.unitCost, party: m.party, reference: m.reference,
  note: m.note, movedOn: dayText(m.movedOn), createdAt: m.createdAt.toISOString(),
});

/** Inventory items and their stock movements. Quantity changes only inside a transaction that locks the item row and writes the movement. */
export class InventoryService implements InventoryApi {
  constructor(private readonly prisma: PrismaClient, private readonly now: () => Date = () => new Date()) {}

  private today(): string { return dayText(this.now()); }

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string | null, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: 'inventory', entityId, metadata } });
  }

  private async reserve(tx: Tx, schoolId: string, key: string): Promise<number> {
    const c = await tx.schoolCounter.upsert({ where: { schoolId_key: { schoolId, key } }, update: { value: { increment: 1 } }, create: { schoolId, key, value: 1 } });
    return c.value;
  }

  private lockItem(tx: Tx, id: string): Promise<unknown> {
    return tx.$queryRaw`SELECT id FROM inventory_items WHERE id = ${id}::uuid FOR UPDATE`;
  }

  private async detail(tx: Tx, schoolId: string, id: string): Promise<ItemDetail> {
    const item = await tx.inventoryItem.findFirst({ where: { id, schoolId } });
    if (!item) throw notFound('Item not found');
    const moves = await tx.inventoryMovement.findMany({ where: { schoolId, itemId: id }, include: moveInclude, orderBy: [{ createdAt: 'desc' }], take: DETAIL_MOVES });
    return { item: itemDto(item), movements: moves.map(moveDto) };
  }

  private async nameTaken(tx: Tx, schoolId: string, name: string, exceptId?: string): Promise<boolean> {
    const dup = await tx.inventoryItem.findFirst({ where: { schoolId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    return dup !== null;
  }

  summary(schoolId: string): Promise<InventorySummary> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const items = await tx.inventoryItem.findMany({ where: { schoolId, active: true }, select: { quantity: true, reorderLevel: true, unitCost: true } });
      return {
        items: items.length, lowItems: items.filter((i) => isLow(i.quantity, i.reorderLevel)).length, outOfStock: items.filter((i) => i.quantity === 0).length,
        totalValue: items.reduce((n, i) => n + stockValue(i.quantity, i.unitCost), 0),
      };
    });
  }

  categories(schoolId: string): Promise<string[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const rows = await tx.inventoryItem.findMany({ where: { schoolId, category: { not: null } }, select: { category: true }, distinct: ['category'], orderBy: { category: 'asc' } });
      return rows.map((r) => r.category).filter((c): c is string => c !== null);
    });
  }

  listItems(schoolId: string, filter: ItemFilter): Promise<{ items: ItemDto[]; truncated: boolean }> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const q = filter.q?.trim();
      const rows = await tx.inventoryItem.findMany({
        where: {
          schoolId, ...(filter.includeInactive ? {} : { active: true }), ...(filter.category ? { category: { equals: filter.category, mode: 'insensitive' } } : {}),
          ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }, { location: { contains: q, mode: 'insensitive' } }] } : {}),
        },
        orderBy: { name: 'asc' }, take: ITEM_LIMIT + 1,
      });
      // "Low" compares two columns, so it is filtered here after reading (a school has a few hundred items at most).
      const items = rows.slice(0, ITEM_LIMIT).map(itemDto).filter((i) => !filter.lowOnly || i.low);
      return { items, truncated: rows.length > ITEM_LIMIT };
    });
  }

  getItem(schoolId: string, id: string): Promise<ItemDetail> {
    return tenantTransaction(this.prisma, schoolId, (tx) => this.detail(tx, schoolId, id));
  }

  createItem(schoolId: string, actorId: string, input: ItemInput): Promise<ItemDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const name = input.name.trim();
      if (await this.nameTaken(tx, schoolId, name)) throw conflict('An item with this name already exists');
      const n = await this.reserve(tx, schoolId, ITEM_COUNTER);
      const opening = input.openingQuantity ?? 0;
      const item = await tx.inventoryItem.create({
        data: {
          schoolId, code: itemCode(n), name, category: tidy(input.category), unit: tidy(input.unit) ?? 'pcs', quantity: opening, reorderLevel: input.reorderLevel ?? 0,
          unitCost: input.unitCost ?? 0, location: tidy(input.location), notes: tidy(input.notes),
        },
      });
      if (opening > 0) {
        await tx.inventoryMovement.create({ data: { schoolId, itemId: item.id, kind: 'IN', delta: opening, balanceAfter: opening, unitCost: input.unitCost ?? null, note: 'Opening stock', movedOn: toDate(this.today()), createdById: actorId } });
      }
      await this.audit(tx, schoolId, actorId, 'inventory.item.create', item.id, { code: item.code, name, opening });
      return itemDto(item);
    });
  }

  updateItem(schoolId: string, actorId: string, id: string, patch: ItemPatch): Promise<ItemDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const item = await tx.inventoryItem.findFirst({ where: { id, schoolId } });
      if (!item) throw notFound('Item not found');
      const data: Prisma.InventoryItemUncheckedUpdateInput = {};
      if (patch.name !== undefined) {
        const name = patch.name.trim();
        if (await this.nameTaken(tx, schoolId, name, id)) throw conflict('An item with this name already exists');
        data.name = name;
      }
      if (patch.category !== undefined) data.category = tidy(patch.category);
      if (patch.unit !== undefined) data.unit = tidy(patch.unit) ?? 'pcs';
      if (patch.reorderLevel !== undefined) data.reorderLevel = patch.reorderLevel;
      if (patch.unitCost !== undefined) data.unitCost = patch.unitCost;
      if (patch.location !== undefined) data.location = tidy(patch.location);
      if (patch.notes !== undefined) data.notes = tidy(patch.notes);
      if (patch.active !== undefined) data.active = patch.active;
      const u = await tx.inventoryItem.update({ where: { id }, data });
      await this.audit(tx, schoolId, actorId, 'inventory.item.update', id, { code: item.code, ...patch });
      return itemDto(u);
    });
  }

  moveStock(schoolId: string, actorId: string, itemId: string, input: StockInput): Promise<ItemDetail> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await this.lockItem(tx, itemId);
      const item = await tx.inventoryItem.findFirst({ where: { id: itemId, schoolId } });
      if (!item) throw notFound('Item not found');
      if (!item.active) throw badRequest('This item is switched off. Turn it on before changing its stock');
      const movedOn = input.movedOn ?? this.today();
      if (movedOn > this.today()) throw badRequest('The date cannot be in the future');
      const r = applyStock(item.quantity, input.kind, input.quantity);
      if (!r.ok) {
        if (r.reason === 'INSUFFICIENT') throw conflict(`Only ${item.quantity} ${item.unit} in stock`, { inStock: item.quantity, asked: input.quantity });
        if (r.reason === 'NO_CHANGE') throw badRequest('The counted quantity is the same as the stock in the system');
        if (r.reason === 'TOO_MUCH') throw badRequest('That would make the stock larger than the system allows');
        throw badRequest('Enter a whole quantity of at least 1');
      }
      const cost = input.kind === 'IN' && input.unitCost !== undefined ? input.unitCost : null;
      await tx.inventoryMovement.create({
        data: { schoolId, itemId, kind: input.kind, delta: r.delta, balanceAfter: r.balance, unitCost: cost, party: tidy(input.party), reference: tidy(input.reference), note: tidy(input.note), movedOn: toDate(movedOn), createdById: actorId },
      });
      await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: r.balance, ...(cost !== null ? { unitCost: cost } : {}) } });
      await this.audit(tx, schoolId, actorId, 'inventory.stock', itemId, { code: item.code, kind: input.kind, delta: r.delta, balance: r.balance });
      return this.detail(tx, schoolId, itemId);
    });
  }

  listMovements(schoolId: string, filter: MovementFilter): Promise<{ movements: MovementDto[]; truncated: boolean }> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const rows = await tx.inventoryMovement.findMany({
        where: {
          schoolId, ...(filter.itemId ? { itemId: filter.itemId } : {}), ...(filter.kind ? { kind: filter.kind } : {}),
          ...(filter.from || filter.to ? { movedOn: { ...(filter.from ? { gte: toDate(filter.from) } : {}), ...(filter.to ? { lte: toDate(filter.to) } : {}) } } : {}),
        },
        include: moveInclude, orderBy: [{ movedOn: 'desc' }, { createdAt: 'desc' }], take: MOVE_LIMIT + 1,
      });
      return { movements: rows.slice(0, MOVE_LIMIT).map(moveDto), truncated: rows.length > MOVE_LIMIT };
    });
  }
}
