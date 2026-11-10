import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import type { InventoryApi } from '../src/modules/inventory/inventory.types';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const ID = '44444444-4444-4444-8444-444444444444';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = { viewer: ['inventory.read'], keeper: ['inventory.read', 'inventory.manage'], manageOnly: ['inventory.manage'], none: ['student.read'] };
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A, userId = 'actor') => `Bearer ${(await tokens.sign({ userId, schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const inventory = {
    summary: rec('summary'), categories: rec('categories', []), listItems: rec('listItems', { items: [], truncated: false }), getItem: rec('getItem'),
    createItem: rec('createItem'), updateItem: rec('updateItem'), moveStock: rec('moveStock'), listMovements: rec('listMovements', { movements: [], truncated: false }),
  } as unknown as InventoryApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    inventory,
  });
  return { app, calls };
}
type M = 'get' | 'post' | 'put' | 'patch' | 'delete';
const call = async (app: ReturnType<typeof build>['app'], role: string, m: M, url: string, body?: object) =>
  (await request(app)[m](url).set('Authorization', await bearer(role)).send(body)).status;

describe('inventory routes', () => {
  it('needs a login, a school and inventory.read', async () => {
    const { app } = build();
    expect((await request(app).get('/api/inventory/items')).status).toBe(401);
    expect(await call(app, 'none', 'get', '/api/inventory/items')).toBe(403);
    expect(await call(app, 'manageOnly', 'get', '/api/inventory/items')).toBe(403);
    expect((await request(app).get('/api/inventory/items').set('Authorization', await bearer('viewer', null))).status).toBe(403);
    for (const url of ['/api/inventory/summary', '/api/inventory/categories', '/api/inventory/items', '/api/inventory/items?lowOnly=true&q=chalk', `/api/inventory/items/${ID}`, '/api/inventory/movements', `/api/inventory/movements?itemId=${ID}&kind=OUT&from=2026-11-01`]) {
      expect(await call(app, 'viewer', 'get', url)).toBe(200);
    }
  });

  it('changing items and stock needs inventory.read AND inventory.manage', async () => {
    const { app } = build();
    const item = { name: 'Chalk box', unit: 'box', reorderLevel: 5, unitCost: 120, openingQuantity: 20 };
    const stock = { kind: 'OUT', quantity: 2, party: 'Class 5 teacher' };
    for (const role of ['viewer', 'manageOnly']) {
      expect(await call(app, role, 'post', '/api/inventory/items', item)).toBe(403);
      expect(await call(app, role, 'patch', `/api/inventory/items/${ID}`, { active: false })).toBe(403);
      expect(await call(app, role, 'post', `/api/inventory/items/${ID}/stock`, stock)).toBe(403);
    }
    expect(await call(app, 'keeper', 'post', '/api/inventory/items', item)).toBe(201);
    expect(await call(app, 'keeper', 'patch', `/api/inventory/items/${ID}`, { active: false })).toBe(200);
    expect(await call(app, 'keeper', 'post', `/api/inventory/items/${ID}/stock`, stock)).toBe(201);
  });

  it('validates input', async () => {
    const { app } = build();
    const item = (b: object) => call(app, 'keeper', 'post', '/api/inventory/items', { name: 'Chalk box', ...b });
    expect(await call(app, 'keeper', 'post', '/api/inventory/items', { name: 'x' })).toBe(400);
    expect(await item({ reorderLevel: -1 })).toBe(400);
    expect(await item({ reorderLevel: 1.5 })).toBe(400);
    expect(await item({ unitCost: 10_000_001 })).toBe(400);
    expect(await item({ openingQuantity: 1_000_001 })).toBe(400);
    expect(await item({ unit: '' })).toBe(400);
    expect(await call(app, 'keeper', 'patch', `/api/inventory/items/${ID}`, {})).toBe(400);
    expect(await call(app, 'keeper', 'patch', '/api/inventory/items/nope', { active: true })).toBe(400);
    const stock = (b: object) => call(app, 'keeper', 'post', `/api/inventory/items/${ID}/stock`, { kind: 'IN', quantity: 1, ...b });
    expect(await stock({ kind: 'MOVE' })).toBe(400);
    expect(await stock({ quantity: -1 })).toBe(400);
    expect(await stock({ quantity: 2.5 })).toBe(400);
    expect(await stock({ movedOn: '2026-02-30' })).toBe(400);
    expect(await stock({ unitCost: -5 })).toBe(400);
    expect(await call(app, 'viewer', 'get', '/api/inventory/movements?kind=SWAP')).toBe(400);
    expect(await call(app, 'viewer', 'get', '/api/inventory/movements?itemId=nope')).toBe(400);
    expect(await call(app, 'viewer', 'get', '/api/inventory/movements?from=2026-13-01')).toBe(400);
  });

  it('the school and the user come from the token only; list flags are parsed', async () => {
    const { app, calls } = build();
    await request(app).post(`/api/inventory/items/${ID}/stock`).set('Authorization', await bearer('keeper', SCHOOL_A, 'u-1')).send({ kind: 'IN', quantity: 3, schoolId: 'evil' });
    const moved = calls.find((c) => c.name === 'moveStock')!;
    expect(moved.args.slice(0, 3)).toEqual([SCHOOL_A, 'u-1', ID]);
    expect(moved.args[3]).toEqual({ kind: 'IN', quantity: 3 });
    await request(app).get('/api/inventory/items?lowOnly=true&includeInactive=false&category=Stationery').set('Authorization', await bearer('viewer'));
    expect(calls.find((c) => c.name === 'listItems')!.args[1]).toEqual({ q: undefined, category: 'Stationery', lowOnly: true, includeInactive: false });
  });
});
