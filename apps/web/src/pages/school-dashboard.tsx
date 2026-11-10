import { CalendarDays, GraduationCap, LayoutGrid, LogIn, ShieldAlert, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fmtNumber } from '@/lib/format';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useAuth } from '@/features/auth/auth-context';
import { PageHeader, SchoolStatusBadge, SubscriptionBadge, fmtDate, fmtDateTime, platformError } from '@/features/platform/common';
import { useOverview } from '@/features/school/school-api';

function Stat({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: number; hint?: string }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="size-6" aria-hidden /></span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-muted">{label}</p>
        <p className="text-2xl font-extrabold text-navy-900">{fmtNumber(value)}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
    </Card>
  );
}

export default function SchoolDashboardPage() {
  const { t, i18n } = useTranslation();
  const { user, can } = useAuth();
  const { data, isLoading, error, refetch } = useOverview();

  if (error) return <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, error)} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>;
  const maxRole = Math.max(1, ...data.usersByRole.map((r) => r.count));

  return (
    <div className="space-y-6">
      <PageHeader title={t('schoolAdmin.dashboard.title', { name: user?.firstName ?? '' })} subtitle={data.school.name} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <SchoolStatusBadge status={data.school.status} t={t} />
        {data.subscription && (
          <>
            <span className="font-semibold text-navy-900">{data.subscription.planName}</span>
            <SubscriptionBadge status={data.subscription.status as never} t={t} />
            {data.subscription.endsAt && <span className="text-muted">{t('platform.detail.until', { date: fmtDate(data.subscription.endsAt, i18n.language) })}</span>}
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Users} label={t('schoolAdmin.dashboard.users')} value={data.counts.users} hint={t('schoolAdmin.dashboard.activeUsers', { count: data.counts.activeUsers })} />
        <Stat icon={GraduationCap} label={t('platform.detail.classes')} value={data.counts.classes} hint={t('schoolAdmin.dashboard.sectionsHint', { count: data.counts.sections })} />
        <Stat icon={LayoutGrid} label={t('platform.detail.subjects')} value={data.counts.subjects} />
        <Stat icon={LogIn} label={t('platform.dashboard.logins7d')} value={data.logins7d} hint={t('schoolAdmin.dashboard.failedHint', { count: data.failedLogins7d })} />
      </div>
      <p className="text-xs text-muted">{t('schoolAdmin.dashboard.moreSoon')}</p>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <CardHeader title={t('schoolAdmin.dashboard.session')} />
          {data.currentSession ? (
            <div className="mt-4 flex items-start gap-3">
              <CalendarDays className="mt-0.5 size-5 text-brand-600" aria-hidden />
              <div>
                <p className="font-bold text-navy-900">{data.currentSession.name}</p>
                <p className="text-sm text-muted">{fmtDate(data.currentSession.startDate, i18n.language)} – {fmtDate(data.currentSession.endDate, i18n.language)}</p>
              </div>
            </div>
          ) : <p className="mt-4 text-sm text-muted">{t('schoolAdmin.dashboard.noSession')}</p>}

          <div className="mt-6 border-t border-line pt-4">
            <h3 className="mb-3 text-sm font-bold text-navy-900">{t('schoolAdmin.dashboard.byRole')}</h3>
            <ul className="space-y-2.5">
              {data.usersByRole.map((r) => (
                <li key={r.roleKey} className="text-sm">
                  <div className="flex justify-between"><span>{t(`roles.${r.roleKey}`, { defaultValue: r.roleName })}</span><strong className="text-navy-900">{r.count}</strong></div>
                  <div className="mt-1 h-1.5 rounded-full bg-canvas"><div className="h-full rounded-full bg-brand-500" style={{ width: `${(r.count / maxRole) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <CardHeader title={t('schoolAdmin.dashboard.recent')} action={can('school.audit.view') ? <Link to="/app/school/logs" className="text-sm font-semibold text-brand-700 hover:underline">{t('schoolAdmin.dashboard.viewAll')}</Link> : undefined} />
          {data.recentActivity.length === 0 ? <p className="mt-4 text-sm text-muted">{t('platform.logs.emptyBody')}</p> : (
            <ul className="mt-3 divide-y divide-line/70">
              {data.recentActivity.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="flex items-center gap-2"><Badge tone="neutral" dir="ltr">{a.action}</Badge><span className="text-muted" dir="ltr">{a.user?.email ?? '—'}</span></span>
                  <time className="text-xs text-muted">{fmtDateTime(a.createdAt, i18n.language)}</time>
                </li>
              ))}
            </ul>
          )}
          {data.failedLogins7d > 0 && (
            <p className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-sm text-muted"><ShieldAlert className="size-4 text-amber-600" aria-hidden />{t('platform.dashboard.failedLogins', { count: data.failedLogins7d })}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
