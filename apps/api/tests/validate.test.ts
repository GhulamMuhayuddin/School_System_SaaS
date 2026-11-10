import express from 'express';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createErrorHandler } from '../src/middleware/error-handler';
import { validate } from '../src/middleware/validate';
import { asyncHandler } from '../src/utils/async-handler';
import { AppError, forbidden } from '../src/utils/errors';

const logger = pino({ level: 'silent' });
function build() {
  const app = express();
  app.use(express.json());
  app.post('/items', validate({ body: z.object({ name: z.string().min(2), qty: z.coerce.number().int().positive() }) }), (req, res) => {
    res.status(201).json(req.body);
  });
  app.get('/boom', asyncHandler(async () => { throw new Error('secret internal detail'); }));
  app.get('/forbidden', asyncHandler(async () => { throw forbidden(); }));
  app.use(createErrorHandler(logger));
  return app;
}

describe('validate middleware', () => {
  it('passes valid data through and applies coercion', async () => {
    const res = await request(build()).post('/items').send({ name: 'Pen', qty: '3' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ name: 'Pen', qty: 3 });
  });
  it('rejects invalid data with 400 VALIDATION_ERROR and field details', async () => {
    const res = await request(build()).post('/items').send({ name: 'P', qty: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fieldErrors.name).toBeTruthy();
  });
});

describe('error handler', () => {
  it('maps AppError to its status and code', async () => {
    const res = await request(build()).get('/forbidden');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(new AppError(418, 'TEAPOT', 'x').status).toBe(418);
  });
  it('hides internal error details on 500', async () => {
    const res = await request(build()).get('/boom');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret internal detail');
  });
});
