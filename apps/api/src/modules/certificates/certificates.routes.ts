import { Router, type Request } from 'express';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { authenticate, requirePermission, requireSchool } from '../auth/auth.middleware';
import type { AuthRuntime } from '../auth/auth.types';
import { idParam, issueBody, listQuery, voidBody } from './certificates.schemas';
import type { CertificateFilter, CertificatesApi } from './certificates.types';

/** /api/certificates/*: the certificate register. certificate.read = view and reprint; issuing and voiding need certificate.read AND certificate.issue. */
export function certificatesRouter(auth: AuthRuntime, certs: CertificatesApi): Router {
  const router = Router();
  const base = [authenticate((t) => auth.verifyAccessToken(t)), requireSchool];
  const read = [...base, requirePermission(auth.permissions, 'certificate.read')];
  const issue = [...base, requirePermission(auth.permissions, 'certificate.read', 'certificate.issue')];
  const sid = (req: Request) => req.auth!.schoolId!;
  const uid = (req: Request) => req.auth!.userId;

  router.get('/', ...read, validate({ query: listQuery }), asyncHandler(async (req, res) => res.json(await certs.list(sid(req), req.query as CertificateFilter))));
  router.post('/', ...issue, validate({ body: issueBody }), asyncHandler(async (req, res) => res.status(201).json(await certs.issue(sid(req), uid(req), req.body))));
  router.get('/:id', ...read, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await certs.get(sid(req), req.params.id))));
  router.post('/:id/void', ...issue, validate({ params: idParam, body: voidBody }), asyncHandler(async (req, res) => res.json(await certs.void(sid(req), uid(req), req.params.id, req.body.reason))));

  return router;
}
