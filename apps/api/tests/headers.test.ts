import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

const app = createApp({ logger: pino({ level: 'silent' }), corsOrigins: ['https://school.example.pk'], checkDatabase: async () => {} });

describe('response headers (Phase 19B)', () => {
  it('API responses are never cached', async () => {
    for (const url of ['/api/health', '/api/health/ready', '/api/does-not-exist']) {
      const res = await request(app).get(url);
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('keeps the helmet protections and hides the framework', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['referrer-policy']).toBeTruthy();
  });

  it('CORS answers only the configured web address, with credentials', async () => {
    const ok = await request(app).get('/api/health').set('Origin', 'https://school.example.pk');
    expect(ok.headers['access-control-allow-origin']).toBe('https://school.example.pk');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const evil = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });
});
