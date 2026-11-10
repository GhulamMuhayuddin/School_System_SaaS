import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Phase 19: a new route must never go live without a guard.
 * Every `router.<method>('/path', ...)` has to start with a spread guard (`...needs('x.read')`, `...read`, ...)
 * unless it is one of the few public or self-guarded routes listed below.
 */
const ALLOWED = new Set([
  'auth.routes.ts POST /login',
  'auth.routes.ts POST /refresh',
  'auth.routes.ts POST /logout',
  'auth.routes.ts POST /logout-all',
  'auth.routes.ts GET /me',
  'auth.routes.ts POST /forgot-password',
  'auth.routes.ts POST /reset-password',
  'auth.routes.ts POST /change-password',
  'health.routes.ts GET /',
  'health.routes.ts GET /ready',
]);

function routeFiles(): string[] {
  const root = join(__dirname, '..', 'src', 'modules');
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => readdirSync(join(root, d.name)).filter((f) => f.endsWith('.routes.ts')).map((f) => join(root, d.name, f)));
}

describe('route guards', () => {
  it('finds the route files', () => {
    expect(routeFiles().length).toBeGreaterThan(20);
  });

  it('every route starts with a guard (or is on the short public list)', () => {
    const unguarded: string[] = [];
    let total = 0;
    for (const file of routeFiles()) {
      const src = readFileSync(file, 'utf8');
      const name = file.split(/[\\/]/).pop()!;
      for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]*)\2\s*,\s*([^\n]{0,60})/g)) {
        total += 1;
        const first = (m[4] ?? '').trim();
        if (first.startsWith('...')) continue;
        if (ALLOWED.has(`${name} ${m[1]!.toUpperCase()} ${m[3]}`)) continue;
        unguarded.push(`${name} ${m[1]!.toUpperCase()} ${m[3]}`);
      }
    }
    expect(total).toBeGreaterThan(200);
    expect(unguarded).toEqual([]);
  });

  it('the public list does not grow by accident (login, refresh, reset and health only)', () => {
    expect(ALLOWED.size).toBe(10);
  });
});
