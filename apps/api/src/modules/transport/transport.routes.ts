import { Router, type Request } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { assignBody, idParam, includeInactiveQuery, riderQuery, routeBody, routePatch, stopsBody, studentParam, vehicleBody, vehiclePatch } from './transport.schemas';
import type { TransportApi } from './transport.types';

/**
 * /api/transport/*: routes with stops, vehicles, and which student rides where.
 * transport.read = view; transport.manage = change anything. Parents and students use /api/portal. School id and caller come from the verified token only.
 */
export function transportRouter(auth: AuthRuntime, transport: TransportApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const needs = (...keys: string[]) => [...base, requirePermission(auth.permissions, ...keys)];
  const read = needs('transport.read');
  const manage = needs('transport.read', 'transport.manage');
  const sid = (req: Request) => req.auth!.schoolId!;
  const uid = (req: Request) => req.auth!.userId;

  router.get('/summary', ...read, asyncHandler(async (req, res) => res.json(await transport.summary(sid(req)))));

  router.get('/vehicles', ...read, asyncHandler(async (req, res) => res.json(await transport.listVehicles(sid(req)))));
  router.post('/vehicles', ...manage, validate({ body: vehicleBody }), asyncHandler(async (req, res) => res.status(201).json(await transport.createVehicle(sid(req), uid(req), req.body))));
  router.patch('/vehicles/:id', ...manage, validate({ params: idParam, body: vehiclePatch }), asyncHandler(async (req, res) => res.json(await transport.updateVehicle(sid(req), uid(req), req.params.id, req.body))));

  router.get('/routes', ...read, validate({ query: includeInactiveQuery }), asyncHandler(async (req, res) => res.json(await transport.listRoutes(sid(req), (req.query as { includeInactive?: string }).includeInactive === 'true'))));
  router.post('/routes', ...manage, validate({ body: routeBody }), asyncHandler(async (req, res) => res.status(201).json(await transport.createRoute(sid(req), uid(req), req.body))));
  router.get('/routes/:id', ...read, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await transport.getRoute(sid(req), req.params.id))));
  router.patch('/routes/:id', ...manage, validate({ params: idParam, body: routePatch }), asyncHandler(async (req, res) => res.json(await transport.updateRoute(sid(req), uid(req), req.params.id, req.body))));
  router.put('/routes/:id/stops', ...manage, validate({ params: idParam, body: stopsBody }), asyncHandler(async (req, res) => res.json(await transport.setStops(sid(req), uid(req), req.params.id, req.body.stops))));

  router.get('/riders', ...read, validate({ query: riderQuery }), asyncHandler(async (req, res) => res.json(await transport.listRiders(sid(req), req.query as { routeId?: string; q?: string }))));
  router.get('/students/:studentId', ...read, validate({ params: studentParam }), asyncHandler(async (req, res) => res.json(await transport.studentTransport(sid(req), req.params.studentId))));
  router.put('/students/:studentId', ...manage, validate({ params: studentParam, body: assignBody }),
    asyncHandler(async (req, res) => res.json(await transport.assign(sid(req), uid(req), req.params.studentId, req.body.routeId, req.body.stopId))));
  router.delete('/students/:studentId', ...manage, validate({ params: studentParam }),
    asyncHandler(async (req, res) => { await transport.unassign(sid(req), uid(req), req.params.studentId); res.status(204).end(); }));

  return router;
}
