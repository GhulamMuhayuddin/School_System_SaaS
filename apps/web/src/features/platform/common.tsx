import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import type { SchoolStatus, SubscriptionStatus } from './platform-api';

/** API messages for 4xx problems the user can fix (duplicate code, last admin...) are shown as written by the server; everything else gets a generic text. */
export function platformError(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK_ERROR') return t('auth.errors.network');
    if (error.status === 403) return t('common.forbiddenTitle');
    if (error.status >= 400 && error.status < 500 && error.code !== 'VALIDATION_ERROR') return error.message;
    if (error.code === 'VALIDATION_ERROR') return t('auth.errors.validation');
  }
  return t('platform.errors.generic');
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold text-navy-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SchoolStatusBadge({ status, t }: { status: SchoolStatus; t: TFunction }) {
  return <Badge tone={status === 'ACTIVE' ? 'success' : 'danger'}>{t(`platform.schoolStatus.${status}`)}</Badge>;
}

const subTone = { TRIAL: 'brand', ACTIVE: 'success', PAST_DUE: 'warning', CANCELLED: 'neutral', EXPIRED: 'danger' } as const;
export function SubscriptionBadge({ status, t }: { status: SubscriptionStatus; t: TFunction }) {
  return <Badge tone={subTone[status]}>{t(`platform.subStatus.${status}`)}</Badge>;
}

export const fmtDate = (iso: string | null, lang: string): string =>
  iso ? new Date(iso).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
export const fmtDateTime = (iso: string, lang: string): string =>
  new Date(iso).toLocaleString(lang === 'ur' ? 'ur-PK' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
