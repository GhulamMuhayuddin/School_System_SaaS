import type { CookieOptions, Response } from 'express';

export interface RefreshCookieConfig {
  name: string;
  secure: boolean;
}

/** Minimal Cookie header parser (returns a Map so odd names such as "__proto__" are harmless). */
export function parseCookies(header: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    let value = part.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      out.set(name, decodeURIComponent(value));
    } catch {
      out.set(name, value);
    }
  }
  return out;
}

// The cookie is only sent to /api/auth/*, never to other API routes, and never readable by scripts.
const baseOptions = (config: RefreshCookieConfig): CookieOptions => ({
  httpOnly: true,
  secure: config.secure,
  sameSite: 'strict',
  path: '/api/auth',
});

export function setRefreshCookie(res: Response, config: RefreshCookieConfig, token: string, expiresAt: Date): void {
  res.cookie(config.name, token, { ...baseOptions(config), expires: expiresAt });
}

export function clearRefreshCookie(res: Response, config: RefreshCookieConfig): void {
  res.clearCookie(config.name, baseOptions(config));
}
