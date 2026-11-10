import type { AuthContext } from '../modules/auth/tokens';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by authenticate() after the access token is verified. Never read schoolId from the body/query instead. */
      auth?: AuthContext;
    }
  }
}

export {};
