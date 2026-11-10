/**
 * Idempotent seed. Safe to run repeatedly.
 * Always: permissions, system roles + their permissions, a "Starter" plan.
 * Requires SEED_SUPERADMIN_EMAIL / SEED_SUPERADMIN_PASSWORD (no default credentials exist).
 * Optional: SEED_DEMO_SCHOOL=true creates a development demo school with one School Admin.
 * Runs on the OWNER connection (DIRECT_URL), which is not subject to Row Level Security.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PERMISSION_CATALOG, PERMISSIONS, ROLE_KEYS, ROLE_LABELS, ROLE_PERMISSIONS } from '@nexora/shared';
import { hashPassword } from '../src/utils/password';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } } });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required. Set it in apps/api/.env before seeding.`);
  return value;
}

function requirePassword(name: string): string {
  const value = required(name);
  if (value.length < 12) throw new Error(`${name} must be at least 12 characters.`);
  return value;
}

async function seedPermissions(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const key of PERMISSIONS) {
    const module = key.split('.')[0] as keyof typeof PERMISSION_CATALOG;
    const row = await prisma.permission.upsert({ where: { key }, update: { module }, create: { key, module } });
    ids.set(key, row.id);
  }
  return ids;
}

async function seedRoles(permissionIds: Map<string, string>): Promise<Map<string, string>> {
  const roleIds = new Map<string, string>();
  for (const key of ROLE_KEYS) {
    const existing = await prisma.role.findFirst({ where: { schoolId: null, key } });
    const role = existing
      ? await prisma.role.update({ where: { id: existing.id }, data: { name: ROLE_LABELS[key], isSystem: true } })
      : await prisma.role.create({ data: { schoolId: null, key, name: ROLE_LABELS[key], isSystem: true } });
    roleIds.set(key, role.id);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: ROLE_PERMISSIONS[key].map((p) => ({ roleId: role.id, permissionId: permissionIds.get(p)! })),
    });
  }
  return roleIds;
}

async function seedPlan() {
  return prisma.subscriptionPlan.upsert({
    where: { name: 'Starter' },
    update: {},
    // Placeholder plan so a school can be created. Real plans and prices are managed by the Super Admin.
    create: { name: 'Starter', priceMonthly: 0, features: {} },
  });
}

async function seedSuperAdmin(roleId: string): Promise<void> {
  const email = required('SEED_SUPERADMIN_EMAIL').toLowerCase();
  const passwordHash = await hashPassword(requirePassword('SEED_SUPERADMIN_PASSWORD'));
  await prisma.user.upsert({
    where: { email },
    update: { roleId },
    create: { email, passwordHash, firstName: 'Platform', lastName: 'Admin', roleId, schoolId: null },
  });
}

async function seedDemoSchool(roleId: string, planId: string): Promise<void> {
  const email = required('SEED_DEMO_ADMIN_EMAIL').toLowerCase();
  const passwordHash = await hashPassword(requirePassword('SEED_DEMO_ADMIN_PASSWORD'));
  const school = await prisma.school.upsert({
    where: { code: 'demo-school' },
    update: {},
    create: { name: 'Demo School', code: 'demo-school', city: 'Lahore' },
  });
  const hasSubscription = await prisma.subscription.findFirst({ where: { schoolId: school.id } });
  if (!hasSubscription) await prisma.subscription.create({ data: { schoolId: school.id, planId, status: 'TRIAL' } });
  await prisma.user.upsert({
    where: { email },
    update: { roleId, schoolId: school.id },
    create: { email, passwordHash, firstName: 'Demo', lastName: 'Admin', roleId, schoolId: school.id },
  });
  const year = new Date().getFullYear();
  await prisma.academicSession.upsert({
    where: { schoolId_name: { schoolId: school.id, name: `${year}-${year + 1}` } },
    update: {},
    create: { schoolId: school.id, name: `${year}-${year + 1}`, startDate: new Date(`${year}-04-01`), endDate: new Date(`${year + 1}-03-31`), isCurrent: true },
  });
}

async function main(): Promise<void> {
  const permissionIds = await seedPermissions();
  const roleIds = await seedRoles(permissionIds);
  const plan = await seedPlan();
  await seedSuperAdmin(roleIds.get('super_admin')!);
  if (process.env.SEED_DEMO_SCHOOL === 'true') await seedDemoSchool(roleIds.get('school_admin')!, plan.id);
  console.log(`Seed complete: ${permissionIds.size} permissions, ${roleIds.size} roles.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
