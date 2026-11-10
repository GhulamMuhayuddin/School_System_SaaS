/**
 * Real database test of Phase 15A inventory. Needs the migration with inventory_items / inventory_movements, `pnpm db:rls`, `pnpm db:seed`.
 * Run:  set RUN_DB_TESTS=1  then  pnpm --filter @nexora/api test
 * Worked numbers (today = 2026-11-04): "Chalk box" opens with 20 at Rs 120, reorder level 5.
 * Issue 8 -> 12. Receive 10 at Rs 130 -> 22 (unit cost becomes 130). Count 18 -> 18 (change -4). Issue 14 -> 4 = LOW (at or below 5).
 * Value = 4 x 130 = 520. The movement history 20, -8, +10, -4, -14 always adds up to the quantity.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InventoryService } from '../src/modules/inventory/inventory.service';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('inventory (PostgreSQL)', () => {
  let owner: PrismaClient; let runtime: PrismaClient; let svc: InventoryService;
  const tag = `inv-${Date.now()}`;
  let a = ''; let b = ''; let actor = '';
  let chalk = ''; let pens = '';

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    svc = new InventoryService(runtime, () => new Date('2026-11-04T09:00:00Z'));
    a = (await owner.school.create({ data: { name: `${tag} A`, code: `${tag}-a` } })).id;
    b = (await owner.school.create({ data: { name: `${tag} B`, code: `${tag}-b` } })).id;
    const role = (await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'store_keeper' } })).id;
    actor = (await owner.user.create({ data: { schoolId: a, roleId: role, email: `${tag}@example.test`, passwordHash: 'x', firstName: 'Store', lastName: 'Keeper' } })).id;
  });
  afterAll(async () => {
    await owner.school.deleteMany({ where: { id: { in: [a, b] } } }).catch(() => {});
    await owner.$disconnect(); await runtime.$disconnect();
  });

  it('creates items with numbers, an opening stock movement and refuses a duplicate name (any case)', async () => {
    const c = await svc.createItem(a, actor, { name: 'Chalk box', category: 'Stationery', unit: 'box', reorderLevel: 5, unitCost: 120, openingQuantity: 20, location: 'Store room' });
    chalk = c.id;
    expect(c).toMatchObject({ code: 'I-000001', quantity: 20, unit: 'box', unitCost: 120, value: 2400, low: false, active: true });
    const p = await svc.createItem(a, actor, { name: 'Pens' });
    pens = p.id;
    expect(p).toMatchObject({ code: 'I-000002', quantity: 0, unit: 'pcs', reorderLevel: 0, low: false });
    await expect(svc.createItem(a, actor, { name: 'chalk BOX' })).rejects.toMatchObject({ status: 409 });
    expect((await svc.createItem(b, actor, { name: 'Chalk box' })).code).toBe('I-000001'); // numbers and names are per school
    const d = await svc.getItem(a, chalk);
    expect(d.movements).toHaveLength(1);
    expect(d.movements[0]).toMatchObject({ kind: 'IN', delta: 20, balanceAfter: 20, note: 'Opening stock' });
  });

  it('issues, receives and counts; the history always adds up', async () => {
    let d = await svc.moveStock(a, actor, chalk, { kind: 'OUT', quantity: 8, party: 'Class 5 teacher', reference: 'REQ-1' });
    expect(d.item.quantity).toBe(12);
    d = await svc.moveStock(a, actor, chalk, { kind: 'IN', quantity: 10, unitCost: 130, party: 'Ali Traders', reference: 'INV-77' });
    expect(d.item).toMatchObject({ quantity: 22, unitCost: 130, value: 2860 });
    d = await svc.moveStock(a, actor, chalk, { kind: 'ADJUST', quantity: 18, note: 'Shelf count' });
    expect(d.item.quantity).toBe(18);
    expect(d.movements[0]).toMatchObject({ kind: 'ADJUST', delta: -4, balanceAfter: 18 });
    d = await svc.moveStock(a, actor, chalk, { kind: 'OUT', quantity: 14, movedOn: '2026-11-03' });
    expect(d.item).toMatchObject({ quantity: 4, low: true, value: 520 });
    const sum = (await owner.inventoryMovement.findMany({ where: { itemId: chalk } })).reduce((n, m) => n + m.delta, 0);
    expect(sum).toBe(4);
    expect(d.movements.map((m) => m.delta)).toEqual([-14, -4, 10, -8, 20]); // newest first (movedOn only changes the date shown)
  });

  it('refuses issuing more than is in stock, a pointless count, a future date, a switched-off item and other schools', async () => {
    await expect(svc.moveStock(a, actor, chalk, { kind: 'OUT', quantity: 5 })).rejects.toMatchObject({ status: 409 }); // only 4
    await expect(svc.moveStock(a, actor, chalk, { kind: 'ADJUST', quantity: 4 })).rejects.toMatchObject({ status: 400 });
    await expect(svc.moveStock(a, actor, chalk, { kind: 'IN', quantity: 1, movedOn: '2026-11-05' })).rejects.toMatchObject({ status: 400 });
    expect((await svc.getItem(a, chalk)).item.quantity).toBe(4); // nothing changed
    await svc.updateItem(a, actor, pens, { active: false });
    await expect(svc.moveStock(a, actor, pens, { kind: 'IN', quantity: 5 })).rejects.toMatchObject({ status: 400 });
    await svc.updateItem(a, actor, pens, { active: true });
    await expect(svc.moveStock(b, actor, chalk, { kind: 'IN', quantity: 5 })).rejects.toMatchObject({ status: 404 });
    await expect(svc.getItem(b, chalk)).rejects.toMatchObject({ status: 404 });
  });

  it('two people issuing the last stock at once cannot make it negative', async () => {
    await svc.moveStock(a, actor, pens, { kind: 'IN', quantity: 5 });
    const results = await Promise.allSettled([svc.moveStock(a, actor, pens, { kind: 'OUT', quantity: 5 }), svc.moveStock(a, actor, pens, { kind: 'OUT', quantity: 5 })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await svc.getItem(a, pens)).item.quantity).toBe(0);
  });

  it('lists, filters low stock and categories, summarizes, and keeps schools apart', async () => {
    expect((await svc.listItems(a, { lowOnly: true, includeInactive: false })).items.map((i) => i.name)).toEqual(['Chalk box']);
    expect((await svc.listItems(a, { q: 'pen', lowOnly: false, includeInactive: false })).items.map((i) => i.name)).toEqual(['Pens']);
    expect((await svc.listItems(a, { category: 'stationery', lowOnly: false, includeInactive: false })).items).toHaveLength(1);
    expect(await svc.categories(a)).toEqual(['Stationery']);
    expect(await svc.summary(a)).toEqual({ items: 2, lowItems: 1, outOfStock: 1, totalValue: 520 });
    await svc.updateItem(a, actor, pens, { active: false });
    expect((await svc.summary(a)).items).toBe(1);
    expect((await svc.listItems(a, { lowOnly: false, includeInactive: true })).items).toHaveLength(2);
    expect((await svc.listItems(b, { lowOnly: false, includeInactive: true })).items.map((i) => i.name)).toEqual(['Chalk box']);
  });

  it('lists movements with filters', async () => {
    const all = await svc.listMovements(a, { itemId: chalk });
    expect(all.movements).toHaveLength(5);
    expect((await svc.listMovements(a, { itemId: chalk, kind: 'OUT' })).movements.map((m) => m.delta).sort((x, y) => x - y)).toEqual([-14, -8]);
    expect((await svc.listMovements(a, { itemId: chalk, from: '2026-11-04' })).movements).toHaveLength(4); // the issue dated 3 Nov is outside
    expect((await svc.listMovements(b, { itemId: chalk })).movements).toEqual([]);
  });
});
