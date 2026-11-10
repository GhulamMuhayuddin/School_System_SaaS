import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db', JWT_ACCESS_SECRET: 'a'.repeat(40) };

describe('loadEnv', () => {
  it('fails fast with a readable message when DATABASE_URL is missing', () => {
    expect(() => loadEnv({ JWT_ACCESS_SECRET: base.JWT_ACCESS_SECRET })).toThrow(/DATABASE_URL/);
  });
  it('applies defaults and parses CORS origins', () => {
    const env = loadEnv({ ...base, CORS_ORIGINS: 'http://a.com, http://b.com' });
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://a.com', 'http://b.com']);
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.ACCESS_TOKEN_TTL_MINUTES).toBe(15);
    expect(env.EMAIL_TRANSPORT).toBe('console');
  });
  it('refuses to start without a strong JWT secret', () => {
    expect(() => loadEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => loadEnv({ ...base, JWT_ACCESS_SECRET: 'too-short' })).toThrow(/JWT_ACCESS_SECRET/);
  });
  it('requires SMTP_HOST when the smtp transport is chosen', () => {
    expect(() => loadEnv({ ...base, EMAIL_TRANSPORT: 'smtp' })).toThrow(/SMTP_HOST/);
    expect(loadEnv({ ...base, EMAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.example.com' }).SMTP_PORT).toBe(587);
  });
  it('enforces secure cookies and a real email transport in production', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(/COOKIE_SECURE/);
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'true' })).toThrow(/EMAIL_TRANSPORT/);
    const env = loadEnv({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'true', EMAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.example.com', CORS_ORIGINS: 'https://school.example.com' });
    expect(env.COOKIE_SECURE).toBe(true);
  });
});

describe('loadEnv: production CORS (Phase 19)', () => {
  const prod = { ...base, NODE_ENV: 'production', COOKIE_SECURE: 'true', EMAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.example.com' };
  it('refuses a wildcard, plain http or a missing https origin in production', () => {
    expect(() => loadEnv({ ...prod, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
    expect(() => loadEnv({ ...prod, CORS_ORIGINS: 'http://school.example.com' })).toThrow(/CORS_ORIGINS/);
    expect(() => loadEnv(prod)).toThrow(/CORS_ORIGINS/); // default is http://localhost:5173
  });
  it('accepts exact https origins in production', () => {
    expect(loadEnv({ ...prod, CORS_ORIGINS: 'https://school.example.com, https://app.example.com' }).CORS_ORIGINS).toHaveLength(2);
  });
});
