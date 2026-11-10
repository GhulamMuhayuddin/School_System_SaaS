import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z.string().url(),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((value) => value.split(',').map((o) => o.trim()).filter(Boolean)),
    TRUST_PROXY: bool.default(false),
    // How many proxies sit between the browser and the API (only used when TRUST_PROXY=true). Docker + Caddy = 1; Vercel -> Render = 2.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(1).max(5).default(1),

    // Authentication (Phase 3). The access-token secret has no default on purpose.
    JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters (see .env.example)'),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
    SESSION_HOURS: z.coerce.number().int().min(1).max(168).default(24),
    SESSION_DAYS_REMEMBER: z.coerce.number().int().min(1).max(90).default(30),
    COOKIE_SECURE: bool.default(false),
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
    LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    RESET_TOKEN_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
    APP_BASE_URL: z.string().url().default('http://localhost:5173'),

    // Email. "console" only logs the message (development); "smtp" really sends it.
    EMAIL_TRANSPORT: z.enum(['console', 'smtp']).default('console'),
    EMAIL_FROM: z.string().min(3).default('Nexora School ERP <no-reply@localhost>'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: bool.default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_TRANSPORT === 'smtp' && !env.SMTP_HOST) {
      ctx.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'is required when EMAIL_TRANSPORT=smtp' });
    }
    if (env.NODE_ENV === 'production') {
      if (!env.COOKIE_SECURE) ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'must be true in production (HTTPS only cookies)' });
      const badOrigins = env.CORS_ORIGINS.filter((o) => o === '*' || !/^https:\/\/[^*\s]+$/.test(o));
      if (badOrigins.length > 0) ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: `in production every origin must be an exact https:// address (no *, no http://): ${badOrigins.join(', ')}` });
      if (env.EMAIL_TRANSPORT === 'console') ctx.addIssue({ code: 'custom', path: ['EMAIL_TRANSPORT'], message: 'console transport is not allowed in production; configure smtp' });
    }
  });

export type Env = z.infer<typeof schema>;

/** Validates environment variables once at startup and fails fast with a readable message. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
