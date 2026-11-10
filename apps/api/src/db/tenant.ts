import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * TENANT ISOLATION - the rules every service must follow
 *  1. School data is only ever read/written through forSchool(prisma, schoolId) or tenantTransaction().
 *  2. schoolId comes from the verified access token, NEVER from the request body/query/params.
 *  3. Cross-school or platform work (login, seeding, Super Admin) uses withBypass(), and only in the
 *     few places that truly need it.
 * Two layers protect data: this module sets the school context + forces schoolId on creates, and
 * Postgres Row Level Security (prisma/sql/rls.sql) rejects anything outside that school even if a
 * query is written wrongly.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string): void {
  if (!UUID.test(value)) throw new Error('Invalid school id');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArgs = Record<string, any>;

/** Forces schoolId on every create so a caller can never write into another school. */
function injectSchoolId(model: string, operation: string, args: AnyArgs, schoolId: string): AnyArgs {
  if (model === 'School') return args;
  const next: AnyArgs = { ...args };
  switch (operation) {
    case 'create':
      next.data = { ...args.data, schoolId };
      break;
    case 'createMany':
    case 'createManyAndReturn':
      next.data = Array.isArray(args.data) ? args.data.map((d: AnyArgs) => ({ ...d, schoolId })) : { ...args.data, schoolId };
      break;
    case 'upsert':
      next.create = { ...args.create, schoolId };
      break;
  }
  return next;
}

/**
 * Returns a client where every query runs inside a transaction that first sets app.school_id.
 * Use scalar foreign keys in create data (classId: '...'), not nested `connect`, with this client.
 */
export function forSchool(base: PrismaClient, schoolId: string) {
  assertUuid(schoolId);
  return base.$extends({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const scoped = injectSchoolId(model, operation, args as AnyArgs, schoolId);
          const [, result] = await base.$transaction([
            base.$executeRaw`SELECT set_config('app.school_id', ${schoolId}, true)`,
            query(scoped),
          ]);
          return result;
        },
      },
    },
  });
}

/** Interactive transaction scoped to one school. Use for multi-step writes such as fee payments. */
export function tenantTransaction<T>(base: PrismaClient, schoolId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  assertUuid(schoolId);
  return base.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.school_id', ${schoolId}, true)`;
    return fn(tx);
  });
}

/** Bypasses tenant filtering. ONLY for login, seeding and Super Admin platform operations. */
export function withBypass<T>(base: PrismaClient, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return base.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
    return fn(tx);
  });
}
