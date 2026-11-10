// Applies prisma/sql/rls.sql using the OWNER connection (DIRECT_URL). Run after every migration.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.DIRECT_URL;
if (!url) {
  console.error('DIRECT_URL is not set (apps/api/.env). It must be the owner connection.');
  process.exit(1);
}
const sql = await readFile(new URL('../prisma/sql/rls.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(sql);
  console.log('RLS policies and grants applied.');
} finally {
  await client.end();
}
