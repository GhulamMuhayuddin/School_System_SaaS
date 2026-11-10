import type { PrismaClient } from '@prisma/client';
import { forSchool } from '../../db/tenant';

export interface RoleDto {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  /** true when the role belongs to this school (not a shared system template) */
  isCustom: boolean;
  permissions: string[];
}

export interface RolesApi {
  listRoles(schoolId: string): Promise<RoleDto[]>;
}

export class RolesService implements RolesApi {
  constructor(private readonly prisma: PrismaClient) {}

  /** System roles (except the platform Super Administrator) plus this school's own roles. Row Level Security hides other schools' roles. */
  async listRoles(schoolId: string): Promise<RoleDto[]> {
    const roles = await forSchool(this.prisma, schoolId).role.findMany({
      where: { key: { not: 'super_admin' } },
      include: { permissions: { include: { permission: { select: { key: true } } } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return roles.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      isSystem: role.isSystem,
      isCustom: role.schoolId !== null,
      permissions: role.permissions.map((p) => p.permission.key).sort(),
    }));
  }
}
