import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { Logger } from 'pino';
import { AppError } from '../utils/errors';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found`, requestId: (req as { id?: unknown }).id } });
};

interface PrismaLikeError {
  name?: string;
  code?: string;
}

/** Single place where every error becomes a consistent JSON response. Internals are never leaked. */
export const createErrorHandler =
  (logger: Logger): ErrorRequestHandler =>
  (err, req, res, _next) => {
    const requestId = (req as { id?: unknown }).id;
    const send = (status: number, code: string, message: string, details?: unknown) =>
      res.status(status).json({ error: { code, message, ...(details !== undefined ? { details } : {}), requestId } });

    if (err instanceof ZodError) return send(400, 'VALIDATION_ERROR', 'Some fields are invalid', err.flatten());
    if (err instanceof AppError) return send(err.status, err.code, err.message, err.details);

    const prisma = err as PrismaLikeError;
    if (prisma?.name === 'PrismaClientKnownRequestError') {
      if (prisma.code === 'P2002') return send(409, 'CONFLICT', 'A record with these details already exists');
      if (prisma.code === 'P2025') return send(404, 'NOT_FOUND', 'Record not found');
    }
    if (err?.type === 'entity.parse.failed') return send(400, 'BAD_REQUEST', 'Request body is not valid JSON');

    logger.error({ err, requestId }, 'Unhandled error');
    return send(500, 'INTERNAL_ERROR', 'Something went wrong on our side');
  };
