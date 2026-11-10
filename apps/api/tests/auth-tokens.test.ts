import { describe, expect, it } from 'vitest';
import { parseCookies } from '../src/modules/auth/cookies';
import { PermissionResolver } from '../src/modules/auth/permission-resolver';
import { AccessTokenService, hashToken, newOpaqueToken } from '../src/modules/auth/tokens';

const SECRET = 's'.repeat(40);
const ctx = { userId: 'user-1', schoolId: '11111111-1111-4111-8111-111111111111', roleId: 'role-1', roleKey: 'school_admin' };
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('opaque tokens', () => {
  it('are long, unique and stored only as a stable SHA-256 hash', () => {
    const a = newOpaqueToken();
    const b = newOpaqueToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(a);
  });
});

describe('AccessTokenService', () => {
  it('signs and verifies, keeping school and role claims (including a null school)', async () => {
    const service = new AccessTokenService(SECRET, 15);
    const { token, expiresInSeconds } = await service.sign(ctx);
    expect(expiresInSeconds).toBe(900);
    expect(await service.verify(token)).toEqual(ctx);
    const platform = { ...ctx, schoolId: null, roleKey: 'super_admin' };
    expect(await service.verify((await service.sign(platform)).token)).toEqual(platform);
  });

  it('rejects a token signed with another secret', async () => {
    const { token } = await new AccessTokenService('o'.repeat(40), 15).sign(ctx);
    await expect(new AccessTokenService(SECRET, 15).verify(token)).rejects.toThrow();
  });

  it('rejects a token whose payload was edited (for example to switch school)', async () => {
    const service = new AccessTokenService(SECRET, 15);
    const [header, , signature] = (await service.sign(ctx)).token.split('.');
    const forged = `${header}.${b64({ sub: 'user-1', sch: '22222222-2222-4222-8222-222222222222', rid: 'role-1', rk: 'school_admin' })}.${signature}`;
    await expect(service.verify(forged)).rejects.toThrow();
  });

  it('rejects an unsigned (alg none) token', async () => {
    const service = new AccessTokenService(SECRET, 15);
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'u', sch: null, rid: 'r', rk: 'super_admin', iss: 'nexora-school-erp', aud: 'nexora-web', exp: now + 600 })}.`;
    await expect(service.verify(unsigned)).rejects.toThrow();
  });

  it('rejects an expired token and accepts it again only when the clock is before expiry', async () => {
    let now = Date.now();
    const service = new AccessTokenService(SECRET, 15, () => now);
    const { token } = await service.sign(ctx);
    now += 14 * 60_000;
    await expect(service.verify(token)).resolves.toEqual(ctx);
    now += 2 * 60_000;
    await expect(service.verify(token)).rejects.toThrow();
  });

  it('refuses a short secret', () => {
    expect(() => new AccessTokenService('short', 15)).toThrow();
  });
});

describe('parseCookies', () => {
  it('reads several cookies and decodes values', () => {
    const cookies = parseCookies('a=1; nexora_rt=abc%2Bdef; b="two"');
    expect(cookies.get('a')).toBe('1');
    expect(cookies.get('nexora_rt')).toBe('abc+def');
    expect(cookies.get('b')).toBe('two');
  });
  it('copes with empty and malformed headers', () => {
    expect(parseCookies(undefined).size).toBe(0);
    expect(parseCookies('novalue; =x; ok=1').get('ok')).toBe('1');
    expect(parseCookies('x=%E0%A4%A').get('x')).toBe('%E0%A4%A');
  });
});

describe('PermissionResolver', () => {
  it('caches a role for the ttl and reloads after it', async () => {
    let calls = 0;
    let now = 0;
    const resolver = new PermissionResolver(async () => { calls += 1; return ['student.read']; }, 60_000, () => now);
    expect((await resolver.get('r')).has('student.read')).toBe(true);
    await resolver.get('r');
    expect(calls).toBe(1);
    now = 61_000;
    await resolver.get('r');
    expect(calls).toBe(2);
  });
});
