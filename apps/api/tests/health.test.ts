import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

const logger = pino({ level: 'silent' });
const make = (checkDatabase: () => Promise<void>) =>
  createApp({ logger, corsOrigins: ['http://localhost:5173'], checkDatabase });

describe('health endpoints', () => {
  it('GET /api/health returns ok and a request id header', async () => {
    const res = await request(make(async () => {})).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('GET /api/health/ready returns 200 when the database is reachable', async () => {
    const res = await request(make(async () => {})).get('/api/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('up');
  });

  it('GET /api/health/ready returns 503 when the database is down', async () => {
    const res = await request(make(async () => { throw new Error('down'); })).get('/api/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.database).toBe('down');
  });
});

describe('error handling', () => {
  it('unknown routes return a JSON 404 in the standard error shape', async () => {
    const res = await request(make(async () => {})).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('malformed JSON returns 400, not 500', async () => {
    const res = await request(make(async () => {})).post('/api/health').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('sets security headers', async () => {
    const res = await request(make(async () => {})).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
