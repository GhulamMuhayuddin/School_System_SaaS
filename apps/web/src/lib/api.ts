/**
 * HTTP client for the Nexora API.
 *  - The ACCESS token lives only in memory (this module), never in localStorage, so page scripts cannot steal it from storage.
 *  - The REFRESH token is an httpOnly cookie the browser sends to /api/auth/* by itself; JavaScript never sees it.
 *  - When a call returns 401 the client refreshes once (shared by all concurrent calls) and retries.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

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

export interface SessionPayload {
  accessToken: string;
  expiresIn: number;
  user: SessionUser;
}

const BASE = `${(import.meta.env.VITE_API_URL as string | undefined) ?? ''}/api`;

let accessToken: string | null = null;
let refreshing: Promise<SessionPayload | null> | null = null;
let onSessionLost: (() => void) | null = null;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};
export const getAccessToken = (): string | null => accessToken;
/** The auth provider registers this so a failed refresh signs the user out of the UI. */
export const setSessionLostHandler = (handler: (() => void) | null): void => {
  onSessionLost = handler;
};

async function parseError(res: Response): Promise<ApiError> {
  let body: { error?: { code?: string; message?: string; details?: unknown } } = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(res.status, body.error?.code ?? 'HTTP_ERROR', body.error?.message ?? `Request failed (${res.status})`, body.error?.details);
}

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${BASE}${path}`, { credentials: 'include', ...init });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server');
  }
}

/** Exchanges the refresh cookie for a new access token. One request at a time; callers share the result. Returns null when there is no valid session. */
export function refreshSession(): Promise<SessionPayload | null> {
  refreshing ??= (async () => {
    try {
      const res = await send('/auth/refresh', { method: 'POST', headers: { Accept: 'application/json' } });
      if (!res.ok) {
        accessToken = null;
        return null;
      }
      const data = (await res.json()) as SessionPayload;
      accessToken = data.accessToken;
      return data;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** false for login/refresh/logout/forgot/reset: no bearer token and no refresh-and-retry. */
  auth?: boolean;
}

export async function apiFetch<T = void>(path: string, { method = 'GET', body, auth = true }: RequestOptions = {}): Promise<T> {
  const build = (): RequestInit => ({
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let res = await send(path, build());
  if (res.status === 401 && auth) {
    const renewed = await refreshSession();
    if (renewed) {
      res = await send(path, build());
    } else {
      onSessionLost?.();
    }
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
