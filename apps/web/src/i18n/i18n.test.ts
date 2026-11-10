import { describe, expect, it } from 'vitest';
import en from './en.json';
import ur from './ur.json';
import { getDirection } from './index';

function keys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('i18n', () => {
  it('Urdu is right-to-left, English is left-to-right', () => {
    expect(getDirection('ur')).toBe('rtl');
    expect(getDirection('en')).toBe('ltr');
  });
  it('English and Urdu define exactly the same keys', () => {
    expect(keys(ur).sort()).toEqual(keys(en).sort());
  });
});

// ---- Phase 18: localisation guards ----
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function flat(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.entries(obj).reduce<Record<string, string>>((acc, [k, v]) => {
    if (typeof v === 'object' && v !== null) Object.assign(acc, flat(v as Record<string, unknown>, `${prefix}${k}.`));
    else acc[`${prefix}${k}`] = String(v);
    return acc;
  }, {});
}
const placeholders = (s: string) => (s.match(/{{\s*\w+\s*}}/g) ?? []).map((p) => p.replace(/\s/g, '')).sort();

// Urdu has no gendered possessive, so these three drop {{pos}} / {{posCap}} on purpose.
const PLACEHOLDER_EXCEPTIONS = new Set(['print.cert.BONAFIDE.body', 'print.cert.conductDefault', 'print.cert.LEAVING.dob']);

describe('i18n quality', () => {
  const E = flat(en);
  const U = flat(ur);

  it('every Urdu string keeps the same {{placeholders}} as English', () => {
    const bad = Object.keys(E).filter((k) => !PLACEHOLDER_EXCEPTIONS.has(k) && placeholders(E[k]!).join() !== placeholders(U[k] ?? '').join());
    expect(bad).toEqual([]);
  });

  it('no Urdu string is empty', () => {
    expect(Object.keys(U).filter((k) => !U[k]!.trim())).toEqual([]);
  });

  it('no screen uses a left/right-only Tailwind class (use start/end so Urdu flips)', () => {
    const forbidden = /(?<![\w-])(?:ml|mr|pl|pr|left|right|text-left|text-right|float-left|float-right|rounded-l|rounded-r|border-l|border-r)-(?:\d|\[|px|auto|full|0)/;
    const root = join(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith('.tsx') && !full.endsWith('.test.tsx') && !full.includes('design-system')) {
          readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
            if (forbidden.test(line)) offenders.push(`${full.replace(root, 'src')}:${i + 1}`);
          });
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
