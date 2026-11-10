// Pre-deployment self-check (Phase 20). Plain Node, no install needed:  node scripts/check-deploy.mjs
// Exit code 1 = something would break or weaken a production deployment. Read the lines marked FAIL.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let failed = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const fail = (m) => { failed++; console.log(`  FAIL  ${m}`); };
const check = (cond, good, bad) => (cond ? ok(good) : fail(bad));

console.log('1. Database migrations cover the whole schema');
const schema = read('apps/api/prisma/schema.prisma');
const tables = [];
for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  const map = m[2].match(/@@map\("([^"]+)"\)/);
  tables.push(map ? map[1] : m[1]);
}
const migDir = join(root, 'apps/api/prisma/migrations');
const sql = existsSync(migDir)
  ? readdirSync(migDir, { withFileTypes: true }).filter((d) => d.isDirectory())
      .map((d) => read(`apps/api/prisma/migrations/${d.name}/migration.sql`)).join('\n')
  : '';
const missing = tables.filter((t) => !new RegExp(`CREATE TABLE "${t}"`).test(sql));
check(
  missing.length === 0,
  `all ${tables.length} tables of schema.prisma are created by committed migrations`,
  `${missing.length} of ${tables.length} tables have NO migration (first: ${missing.slice(0, 5).join(', ')}). ` +
    '`prisma migrate deploy` on a new server would build an incomplete database. Run `pnpm db:migrate` on your PC, then commit apps/api/prisma/migrations.',
);

console.log('2. Compose file');
const compose = read('docker-compose.prod.yml');
const dbBlock = compose.split(/\n  api:/)[0].replace(/#.*$/gm, '');
check(!/\n\s+ports:/.test(dbBlock), 'database port is not published', 'the db service publishes a port');
check(/TRUST_PROXY: "true"/.test(compose) && /COOKIE_SECURE: "true"/.test(compose), 'TRUST_PROXY and COOKIE_SECURE are true', 'TRUST_PROXY / COOKIE_SECURE not true');
check(/EMAIL_TRANSPORT: smtp/.test(compose), 'e-mail transport is smtp', 'EMAIL_TRANSPORT is not smtp');
check(/DATABASE_URL: postgresql:\/\/nexora_app:/.test(compose.split('  web:')[0]), 'the API runs as nexora_app (not the owner)', 'the API does not use nexora_app');
check(!/^\s+- "?\d+:4000"?/m.test(compose), 'the API port 4000 is not published', 'port 4000 is published');

console.log('3. Environment template');
const envEx = read('.env.production.example');
const used = new Set([...compose.matchAll(/\$\{([A-Z_]+)[:?}-]/g)].map((m) => m[1]));
const defined = new Set([...envEx.matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1]));
const undef = [...used].filter((k) => !defined.has(k));
check(undef.length === 0, 'every variable used by the compose file is in .env.production.example', `missing in .env.production.example: ${undef.join(', ')}`);
check(!existsSync(join(root, '.env.production')), 'no .env.production inside the project folder being shipped', '.env.production exists here: do not ZIP, commit or share it');
check(!/^[A-Z_]+=\S*(password|secret)\S*\s*$/im.test(envEx.replace(/CHANGE-ME[^\n]*/g, '')), 'the template holds no real-looking secrets', 'the template may hold a real secret');

console.log('4. Web headers');
const headers = read('apps/web/public/_headers');
const csp = headers.split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:')).replace('Content-Security-Policy:', '').trim();
check(read('docker/nginx/web.conf').split(csp).length - 1 >= 2, 'docker/nginx/web.conf carries the same CSP (server + location)', 'docker/nginx/web.conf CSP differs from apps/web/public/_headers');
check(read('docs/deploy/nginx-web.conf.example').includes(csp), 'docs/deploy/nginx-web.conf.example carries the same CSP', 'nginx example CSP differs');

console.log('5. Files the deployment needs');
for (const f of ['docker/Dockerfile', 'docker/caddy/Caddyfile', 'docker/postgres/init-prod.sh', 'scripts/backup.sh', 'scripts/restore.sh', 'scripts/restore-test.sh', 'pnpm-lock.yaml', 'docs/DEPLOYMENT.md', 'docs/OPERATIONS.md']) {
  check(existsSync(join(root, f)), f, `missing: ${f}`);
}

console.log(failed ? `\n${failed} problem(s). Fix them before going live.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
