import { Router, type Request } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { idParam, itemBody, itemPatch, itemQuery, movementQuery, stockBody } from './inventory.schemas';
import type { InventoryApi, MovementFilter } from './inventory.types';

/** /api/inventory/*: items, stock movements and the low-stock view. inventory.read = view; changing needs inventory.read AND inventory.manage. */
export function inventoryRouter(auth: AuthRuntime, inventory: InventoryApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const needs = (...keys: string[]) => [...base, requirePermission(auth.permissions, ...keys)];
  const read = needs('inventory.read');
  const manage = needs('inventory.read', 'inventory.manage');
  const sid = (req: Request) => req.auth!.schoolId!;
  const uid = (req: Request) => req.auth!.userId;
  const yes = (v: string | undefined) => v === 'true';

  router.get('/summary', ...read, asyncHandler(async (req, res) => res.json(await inventory.summary(sid(req)))));
  router.get('/categories', ...read, asyncHandler(async (req, res) => res.json({ categories: await inventory.categories(sid(req)) })));
  router.get('/items', ...read, validate({ query: itemQuery }), asyncHandler(async (req, res) => {
    const q = req.query as { q?: string; category?: string; lowOnly?: string; includeInactive?: string };
    res.json(await inventory.listItems(sid(req), { q: q.q, category: q.category, lowOnly: yes(q.lowOnly), includeInactive: yes(q.includeInactive) }));
  }));
  router.post('/items', ...manage, validate({ body: itemBody }), asyncHandler(async (req, res) => res.status(201).json(await inventory.createItem(sid(req), uid(req), req.body))));
  router.get('/items/:id', ...read, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await inventory.getItem(sid(req), req.params.id))));
  router.patch('/items/:id', ...manage, validate({ params: idParam, body: itemPatch }), asyncHandler(async (req, res) => res.json(await inventory.updateItem(sid(req), uid(req), req.params.id, req.body))));
  router.post('/items/:id/stock', ...manage, validate({ params: idParam, body: stockBody }), asyncHandler(async (req, res) => res.status(201).json(await inventory.moveStock(sid(req), uid(req), req.params.id, req.body))));
  router.get('/movements', ...read, validate({ query: movementQuery }), asyncHandler(async (req, res) => res.json(await inventory.listMovements(sid(req), req.query as MovementFilter))));

  return router;
}
