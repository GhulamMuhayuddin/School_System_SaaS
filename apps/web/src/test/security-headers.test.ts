import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const headers = read('../../public/_headers');
const csp = (headers.split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:')) ?? '').replace('Content-Security-Policy:', '').trim();
const directive = (name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `) || d === name);

describe('web security headers (public/_headers)', () => {
  it('has a CSP that allows only the app itself', () => {
    expect(directive('default-src')).toBe("default-src 'self'");
    expect(directive('script-src')).toBe("script-src 'self'");
    expect(directive('object-src')).toBe("object-src 'none'");
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive('base-uri')).toBe("base-uri 'self'");
    expect(directive('form-action')).toBe("form-action 'self'");
  });
  it('never allows eval, inline scripts, wildcards or plain http', () => {
    const scripts = directive('script-src') ?? '';
    expect(scripts).not.toMatch(/unsafe-inline|unsafe-eval|\*|http:/);
    expect(csp).not.toMatch(/unsafe-eval/);
    expect(csp).not.toMatch(/(^|[\s;])\*([\s;]|$)/);
    expect(csp).not.toContain('http://');
  });
  it('sets the other protective headers and caches only hashed assets', () => {
    for (const h of ['Strict-Transport-Security: max-age=', 'X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY', 'Referrer-Policy:', 'Permissions-Policy:']) expect(headers).toContain(h);
    expect(headers).toMatch(/\/assets\/\*\s+Cache-Control: public, max-age=31536000, immutable/);
    expect(headers).toMatch(/\/index\.html\s+Cache-Control: no-cache/);
  });
  it('the nginx example carries the same CSP as the _headers file', () => {
    const nginx = read('../../../../docs/deploy/nginx-web.conf.example');
    expect(nginx).toContain(csp);
  });
  it('index.html has no inline script, so script-src without unsafe-inline works', () => {
    const html = read('../../index.html');
    for (const m of html.matchAll(/<script\b([^>]*)>/g)) expect(m[1]).toMatch(/\bsrc=/);
  });
});
