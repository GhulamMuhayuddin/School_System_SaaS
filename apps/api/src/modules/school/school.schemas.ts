import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
const nullableText = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable();
const email = z.string().trim().toLowerCase().email().max(254);

export const idParam = z.object({ id: z.string().uuid() });

export const updateProfileBody = z
  .object({
    name: text(150),
    email: z.union([email, z.literal(''), z.null()]).transform((v) => (v ? v : null)),
    phone: nullableText(40),
    address: nullableText(300),
    city: nullableText(100),
    timezone: text(60),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const listUsersQuery = z.object({
  q: z.string().trim().max(100).optional(),
  roleId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED']).optional(),
});

export const createUserBody = z.object({
  firstName: text(80), lastName: text(80), email,
  phone: nullableText(40).optional(),
  roleId: z.string().uuid(),
  password: z.string().min(10, 'Password must be at least 10 characters').max(128),
});

export const updateUserBody = z
  .object({ firstName: text(80), lastName: text(80), phone: nullableText(40), roleId: z.string().uuid() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const userStatusBody = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) });

export const auditLogsQuery = z.object({
  action: z.string().trim().max(80).optional(),
  userId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const staffAccountBody = z.object({ email, password: z.string().min(10, 'Password must be at least 10 characters').max(128), roleId: z.string().uuid() });
export const studentAccountBody = z.object({ email, password: z.string().min(10, 'Password must be at least 10 characters').max(128) });
export const guardianAccountBody = z.object({ email, password: z.string().min(10, 'Password must be at least 10 characters').max(128) });
