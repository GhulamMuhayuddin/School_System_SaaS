import { Router, type Request } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { assignBody, hostelBody, hostelPatch, idParam, includeInactiveQuery, residentQuery, roomBody, roomPatch, roomQuery, studentParam } from './hostel.schemas';
import type { HostelApi } from './hostel.types';

/**
 * /api/hostel/*: hostels, rooms with beds, and which student lives where.
 * hostel.read = view; hostel.manage = change anything. Parents and students use /api/portal. School id and caller come from the verified token only.
 */
export function hostelRouter(auth: AuthRuntime, hostel: HostelApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const needs = (...keys: string[]) => [...base, requirePermission(auth.permissions, ...keys)];
  const read = needs('hostel.read');
  const manage = needs('hostel.read', 'hostel.manage');
  const sid = (req: Request) => req.auth!.schoolId!;
  const uid = (req: Request) => req.auth!.userId;
  const yes = (v: string | undefined) => v === 'true';

  router.get('/summary', ...read, asyncHandler(async (req, res) => res.json(await hostel.summary(sid(req)))));

  router.get('/hostels', ...read, validate({ query: includeInactiveQuery }), asyncHandler(async (req, res) => res.json(await hostel.listHostels(sid(req), yes((req.query as { includeInactive?: string }).includeInactive)))));
  router.post('/hostels', ...manage, validate({ body: hostelBody }), asyncHandler(async (req, res) => res.status(201).json(await hostel.createHostel(sid(req), uid(req), req.body))));
  router.patch('/hostels/:id', ...manage, validate({ params: idParam, body: hostelPatch }), asyncHandler(async (req, res) => res.json(await hostel.updateHostel(sid(req), uid(req), req.params.id, req.body))));

  router.get('/rooms', ...read, validate({ query: roomQuery }), asyncHandler(async (req, res) => {
    const q = req.query as { hostelId?: string; includeInactive?: string };
    res.json(await hostel.listRooms(sid(req), { hostelId: q.hostelId, includeInactive: yes(q.includeInactive) }));
  }));
  router.post('/rooms', ...manage, validate({ body: roomBody }), asyncHandler(async (req, res) => res.status(201).json(await hostel.createRoom(sid(req), uid(req), req.body))));
  router.patch('/rooms/:id', ...manage, validate({ params: idParam, body: roomPatch }), asyncHandler(async (req, res) => res.json(await hostel.updateRoom(sid(req), uid(req), req.params.id, req.body))));

  router.get('/residents', ...read, validate({ query: residentQuery }), asyncHandler(async (req, res) => res.json(await hostel.listResidents(sid(req), req.query as { hostelId?: string; roomId?: string; q?: string }))));
  router.get('/students/:studentId', ...read, validate({ params: studentParam }), asyncHandler(async (req, res) => res.json(await hostel.studentHostel(sid(req), req.params.studentId))));
  router.put('/students/:studentId', ...manage, validate({ params: studentParam, body: assignBody }),
    asyncHandler(async (req, res) => res.json(await hostel.assign(sid(req), uid(req), req.params.studentId, req.body.roomId))));
  router.delete('/students/:studentId', ...manage, validate({ params: studentParam }),
    asyncHandler(async (req, res) => { await hostel.unassign(sid(req), uid(req), req.params.studentId); res.status(204).end(); }));

  return router;
}
