import { Building2, CircleOff, LogIn, ShieldAlert, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fmtNumber } from '@/lib/format';
import { Card, CardHeader } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useAuth } from '@/features/auth/auth-context';
import { PageHeader, platformError } from '@/features/platform/common';
import { useAnalytics, type SubscriptionStatus } from '@/features/platform/platform-api';

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="size-6" aria-hidden /></span>
      <div>
        <p className="text-sm font-semibold text-muted">{label}</p>
        <p className="text-2xl font-extrabold text-navy-900">{fmtNumber(value)}</p>
      </div>
    </Card>
  );
}

export default function PlatformDashboardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useAnalytics();

  if (error) return <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, error)} onRetry={() => void refetch()} />;
  if (isLoading || !data) {
    return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>;
  }
  const maxMonth = Math.max(1, ...data.newSchoolsByMonth.map((m) => m.count));
  const subs = (['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED', 'NONE'] as const).filter((k) => data.subscriptions[k] > 0);
  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(i18n.language === 'ur' ? 'ur-PK' : 'en-GB', { month: 'short', timeZone: 'UTC' });

  return (
    <div>
      <PageHeader title={t('platform.dashboard.title', { name: user?.firstName ?? '' })} subtitle={t('platform.dashboard.subtitle')} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Building2} label={t('platform.dashboard.schools')} value={data.schools.total} />
        <Stat icon={CircleOff} label={t('platform.dashboard.suspended')} value={data.schools.suspended} />
        <Stat icon={Users} label={t('platform.dashboard.schoolUsers')} value={data.users.schoolUsers} />
        <Stat icon={LogIn} label={t('platform.dashboard.logins7d')} value={data.logins7d} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <CardHeader title={t('platform.dashboard.newSchools')} description={t('platform.dashboard.last6')} />
          <div className="mt-4 flex h-44 items-end gap-3" role="img" aria-label={t('platform.dashboard.newSchools')}>
            {data.newSchoolsByMonth.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span className="text-xs font-bold text-navy-900">{m.count}</span>
                <div className="w-full max-w-12 rounded-t-md bg-brand-500" style={{ height: `${(m.count / maxMonth) * 100}%`, minHeight: m.count ? 6 : 2, opacity: m.count ? 1 : 0.25 }} />
                <span className="text-xs text-muted">{monthLabel(m.month)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <CardHeader title={t('platform.dashboard.subscriptions')} />
          {subs.length === 0 ? (
            <p className="mt-4 text-sm text-muted">{t('platform.dashboard.noSchools')}</p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {subs.map((k) => (
                <li key={k} className="flex items-center justify-between text-sm">
                  <span className="text-ink">{k === 'NONE' ? t('platform.dashboard.noSubscription') : t(`platform.subStatus.${k as SubscriptionStatus}`)}</span>
                  <span className="font-bold text-navy-900">{data.subscriptions[k]}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-sm text-muted">
            <ShieldAlert className="size-4 text-amber-600" aria-hidden />
            {t('platform.dashboard.failedLogins', { count: data.failedLogins7d })}
          </div>
        </Card>
      </div>
    </div>
  );
}
