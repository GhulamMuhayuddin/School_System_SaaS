import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z.union([z.string().trim().max(max), z.null()]).optional().transform((v) => (v === '' ? null : v));
const email = z.string().trim().toLowerCase().email().max(254);
// Passwords for accounts created by an administrator: longer than the 8-character minimum users get when they pick their own.
const initialPassword = z.string().min(10, 'Password must be at least 10 characters').max(128);
const subscriptionStatus = z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED']);

export const idParam = z.object({ id: z.string().uuid() });

export const listSchoolsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

const schoolFields = {
  name: text(150),
  email: optionalText(254),
  phone: optionalText(40),
  address: optionalText(300),
  city: optionalText(100),
  timezone: text(60),
};

export const createSchoolBody = z.object({
  ...schoolFields,
  email: z.union([email, z.literal(''), z.null()]).optional().transform((v) => (v ? v : null)),
  timezone: schoolFields.timezone.default('Asia/Karachi'),
  // Short, URL-safe identifier: lowercase letters, digits and dashes.
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/, 'Use 3-40 lowercase letters, digits or dashes'),
  planId: z.string().uuid(),
  admin: z.object({ firstName: text(80), lastName: text(80), email, password: initialPassword }),
});

export const updateSchoolBody = z
  .object({
    ...schoolFields,
    email: z.union([email, z.literal(''), z.null()]).transform((v) => (v ? v : null)),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const schoolStatusBody = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) });

export const subscriptionBody = z.object({
  planId: z.string().uuid(),
  status: subscriptionStatus,
  endsAt: z.union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
});

const planFields = {
  name: text(80),
  priceMonthly: z.number().min(0).max(100_000_000),
  maxStudents: z.number().int().positive().max(1_000_000).nullable().optional(),
  maxStaff: z.number().int().positive().max(1_000_000).nullable().optional(),
  isActive: z.boolean(),
};
export const createPlanBody = z.object({ ...planFields, isActive: planFields.isActive.default(true) });
export const updatePlanBody = z.object(planFields).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const auditLogsQuery = z.object({
  schoolId: z.string().uuid().optional(),
  action: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const createPlatformAdminBody = z.object({ firstName: text(80), lastName: text(80), email, password: initialPassword });
export const platformAdminStatusBody = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) });
