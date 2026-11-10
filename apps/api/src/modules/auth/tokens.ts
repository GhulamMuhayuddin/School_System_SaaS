import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'nexora-school-erp';
const AUDIENCE = 'nexora-web';

/** Who is calling. Built from the VERIFIED access token only. */
export interface AuthContext {
  userId: string;
  /** null for platform users (Super Administrator). */
  schoolId: string | null;
  roleId: string;
  roleKey: string;
}

/** Opaque random token for refresh cookies and password-reset links (256 bits). */
export const newOpaqueToken = (): string => randomBytes(32).toString('base64url');

/** Only this hash is stored in the database, so a database leak does not reveal usable tokens. */
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Short-lived signed access token (HS256). Refresh tokens are opaque and live in the database. */
export class AccessTokenService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly ttlMinutes: number,
    private readonly clock: () => number = Date.now,
  ) {
    if (secret.length < 32) throw new Error('JWT access secret must be at least 32 characters');
    this.key = new TextEncoder().encode(secret);
  }

  async sign(ctx: AuthContext): Promise<{ token: string; expiresInSeconds: number }> {
    const issuedAt = Math.floor(this.clock() / 1000);
    const expiresInSeconds = this.ttlMinutes * 60;
    const token = await new SignJWT({ sch: ctx.schoolId, rid: ctx.roleId, rk: ctx.roleKey })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(ctx.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + expiresInSeconds)
      .sign(this.key);
    return { token, expiresInSeconds };
  }

  /** Throws when the token is missing claims, expired, tampered with, or signed with another algorithm/secret. */
  async verify(token: string): Promise<AuthContext> {
    const { payload } = await jwtVerify(token, this.key, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
      currentDate: new Date(this.clock()),
    });
    const { sub, sch, rid, rk } = payload;
    if (typeof sub !== 'string' || typeof rid !== 'string' || typeof rk !== 'string' || !(sch === null || typeof sch === 'string')) {
      throw new Error('Malformed token claims');
    }
    return { userId: sub, schoolId: sch, roleId: rid, roleKey: rk };
  }
}
