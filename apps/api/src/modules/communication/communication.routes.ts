import { Router, type Request } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { announcementBody, idParam, inboxQuery } from './communication.schemas';
import type { CommunicationApi } from './communication.types';

/**
 * /api/communication/*: announcements.
 *  communication.read = read what is addressed to you (every staff role, parents and students) and mark it read.
 *  Sending, the sent list and withdrawing need communication.read AND communication.send (school admin, principal, vice principal).
 *  Who sees what is decided by the server from the signed-in user, never from a request value.
 */
export function communicationRouter(auth: AuthRuntime, comm: CommunicationApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const read = [...base, requirePermission(auth.permissions, 'communication.read')];
  const send = [...base, requirePermission(auth.permissions, 'communication.read', 'communication.send')];
  const sid = (req: Request) => req.auth!.schoolId!;
  const uid = (req: Request) => req.auth!.userId;

  router.get('/announcements', ...read, validate({ query: inboxQuery }), asyncHandler(async (req, res) =>
    res.json(await comm.inbox(sid(req), uid(req), (req.query as { unreadOnly?: string }).unreadOnly === 'true'))));
  router.get('/unread-count', ...read, asyncHandler(async (req, res) => res.json({ count: await comm.unreadCount(sid(req), uid(req)) })));
  router.post('/announcements/read-all', ...read, asyncHandler(async (req, res) => res.json({ marked: await comm.markAllRead(sid(req), uid(req)) })));
  router.post('/announcements/:id/read', ...read, validate({ params: idParam }), asyncHandler(async (req, res) => { await comm.markRead(sid(req), uid(req), req.params.id); res.status(204).end(); }));

  router.post('/announcements', ...send, validate({ body: announcementBody }), asyncHandler(async (req, res) => res.status(201).json(await comm.create(sid(req), uid(req), req.body))));
  router.get('/sent', ...send, asyncHandler(async (req, res) => res.json(await comm.listSent(sid(req)))));
  router.post('/announcements/:id/withdraw', ...send, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await comm.withdraw(sid(req), uid(req), req.params.id))));

  return router;
}
