import { GraduationCap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useAuth } from '@/features/auth/auth-context';
import { PageHeader, platformError } from '@/features/platform/common';
import { usePortalChildren } from '@/features/portal/portal-api';

/** Landing page of parent and student accounts. One child (or a student's own record) opens directly; several children are listed. */
export default function PortalHomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = usePortalChildren();
  if (error) return <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, error)} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <Skeleton className="h-40" />;
  if (data.children.length === 1) return <Navigate to={`/app/portal/${data.children[0]!.id}/attendance`} replace />;
  return (
    <div>
      <PageHeader title={t('portal.title', { name: user?.firstName ?? '' })} subtitle={user?.school?.name} />
      {data.children.length === 0 ? <EmptyState title={t('portal.emptyTitle')} description={t('portal.emptyBody')} /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.children.map((c) => (
            <Link key={c.id} to={`/app/portal/${c.id}/attendance`} className="block rounded-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">
              <Card className="p-5 transition hover:shadow-md">
                <div className="flex items-start gap-4">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><GraduationCap className="size-6" aria-hidden /></span>
                  <div>
                    <p className="text-lg font-extrabold text-navy-900">{c.firstName} {c.lastName}</p>
                    <p className="text-sm text-muted">{c.class.name}{c.section ? ` \u2013 ${c.section.name}` : ''} \u00b7 <span dir="ltr">{c.admissionNo}</span></p>
                    <Badge tone={c.status === 'ACTIVE' ? 'success' : 'neutral'} className="mt-2">{t(`students.statuses.${c.status}`)}</Badge>
                    <p className="mt-3 text-sm font-semibold text-brand-600">{t('portal.open')}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
