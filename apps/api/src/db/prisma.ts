import { PrismaClient } from '@prisma/client';

/** Base client. Connects as the restricted runtime role. Do NOT use directly for school data: use forSchool(). */
export function createPrismaClient(url?: string): PrismaClient {
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}
