import type { AuthContext } from './tokens';
import type { RefreshCookieConfig } from './cookies';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  remember?: boolean;
}

/** What the frontend gets about the signed-in user (never the password hash). */
export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  preferredLang: string;
  role: { id: string; key: string; name: string };
  school: { id: string; name: string; code: string } | null;
  permissions: string[];
}

export interface SessionResult {
  accessToken: string;
  expiresInSeconds: number;
  /** Goes into the httpOnly cookie only; never put it in a JSON response. */
  refreshToken: string;
  refreshExpiresAt: Date;
  user: SessionUser;
}

/** The operations the HTTP layer needs. Routes depend on this interface so they can be tested with a fake. */
export interface AuthApi {
  login(input: LoginInput, meta: RequestMeta): Promise<SessionResult>;
  refresh(rawToken: string | undefined, meta: RequestMeta): Promise<SessionResult>;
  logout(rawToken: string | undefined, meta: RequestMeta): Promise<void>;
  logoutAll(userId: string, meta: RequestMeta): Promise<void>;
  forgotPassword(email: string, meta: RequestMeta): Promise<void>;
  resetPassword(rawToken: string, newPassword: string, meta: RequestMeta): Promise<void>;
  changePassword(userId: string, currentPassword: string, newPassword: string, meta: RequestMeta): Promise<void>;
  getProfile(ctx: AuthContext): Promise<SessionUser>;
}

export interface PermissionLookup {
  get(roleId: string): Promise<ReadonlySet<string>>;
}

export interface RateLimitRule {
  windowMs: number;
  limit: number;
}

export interface AuthLimits {
  login: RateLimitRule;
  forgotPassword: RateLimitRule;
  resetPassword: RateLimitRule;
  refresh: RateLimitRule;
  changePassword: RateLimitRule;
}

/** Everything app.ts needs to mount authentication and protect routes. */
export interface AuthRuntime {
  service: AuthApi;
  verifyAccessToken(token: string): Promise<AuthContext>;
  permissions: PermissionLookup;
  cookie: RefreshCookieConfig;
  limits?: Partial<AuthLimits>;
}
