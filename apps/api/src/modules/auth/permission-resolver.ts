import type { PrismaClient } from '@prisma/client';

/** Loads the permission keys of a role. role_permissions has no school_id, so no tenant context is needed. */
export async function loadRolePermissionKeys(prisma: PrismaClient, roleId: string): Promise<string[]> {
  const rows = await prisma.rolePermission.findMany({ where: { roleId }, select: { permission: { select: { key: true } } } });
  return rows.map((r) => r.permission.key);
}

/**
 * Resolves a role's permission keys with a short cache so authorization does not hit the database on
 * every request. A change to a role's permissions is therefore visible within ttlMs.
 */
export class PermissionResolver {
  private readonly cache = new Map<string, { keys: ReadonlySet<string>; expiresAt: number }>();

  constructor(
    private readonly load: (roleId: string) => Promise<string[]>,
    private readonly ttlMs = 60_000,
    private readonly clock: () => number = Date.now,
  ) {}

  async get(roleId: string): Promise<ReadonlySet<string>> {
    const hit = this.cache.get(roleId);
    const now = this.clock();
    if (hit && hit.expiresAt > now) return hit.keys;
    const keys: ReadonlySet<string> = new Set(await this.load(roleId));
    this.cache.set(roleId, { keys, expiresAt: now + this.ttlMs });
    return keys;
  }

  clear(): void {
    this.cache.clear();
  }
}
