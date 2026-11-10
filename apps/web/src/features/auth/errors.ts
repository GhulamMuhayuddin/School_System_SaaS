import type { TFunction } from 'i18next';
import { ApiError } from '@/lib/api';

/** Turns an API error into a message in the user's language. Unknown problems get a safe generic text. */
export function authErrorMessage(t: TFunction, error: unknown): string {
  if (!(error instanceof ApiError)) return t('auth.errors.generic');
  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return t('auth.errors.invalidCredentials');
    case 'ACCOUNT_LOCKED': {
      const seconds = (error.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
      return t('auth.errors.locked', { minutes: Math.max(1, Math.ceil((seconds ?? 900) / 60)) });
    }
    case 'ACCOUNT_DISABLED':
      return t('auth.errors.disabled');
    case 'SCHOOL_SUSPENDED':
      return t('auth.errors.suspended');
    case 'RATE_LIMITED':
      return t('auth.errors.rateLimited');
    case 'INVALID_RESET_TOKEN':
      return t('auth.errors.invalidResetToken');
    case 'CURRENT_PASSWORD_INCORRECT':
      return t('auth.errors.currentPassword');
    case 'VALIDATION_ERROR':
      return t('auth.errors.validation');
    case 'NETWORK_ERROR':
      return t('auth.errors.network');
    default:
      return t('auth.errors.generic');
  }
}
