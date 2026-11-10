import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { PageHeader, platformError } from '@/features/platform/common';
import { PORTAL_TABS, usePortalChildren, type PortalTab } from '@/features/portal/portal-api';
import { AttendanceTab, CalendarTab, FeesTab, HomeworkTab, HostelTab, LibraryTab, ResultsTab, TimetableTab, TransportTab } from '@/features/portal/portal-tabs';
import { cn } from '@/lib/cn';

/** One child (or the student themselves): overview, attendance, results, fees, homework, timetable and calendar. The server only returns data of own children. */
export default function PortalChildPage() {
  const { t } = useTranslation();
  const { studentId = '', tab } = useParams();
  const { data, isLoading, error, refetch } = usePortalChildren();
  if (error) return <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, error)} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <Skeleton className="h-64" />;
  const child = data.children.find((c) => c.id === studentId);
  if (!child) return <Navigate to="/app" replace />;
  const active: PortalTab = (PORTAL_TABS as readonly string[]).includes(tab ?? '') ? (tab as PortalTab) : 'attendance';
  const single = data.children.length === 1;
  return (
    <div className="space-y-5">
      {!single && <Link to="/app" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{t('portal.allChildren')}</Link>}
      <PageHeader title={`${child.firstName} ${child.lastName}`} subtitle={`${child.class.name}${child.section ? ` \u2013 ${child.section.name}` : ''} \u00b7 ${child.admissionNo}`} action={<Badge tone={child.status === 'ACTIVE' ? 'success' : 'neutral'}>{t(`students.statuses.${child.status}`)}</Badge>} />
      <nav aria-label={t('portal.sections')} className="flex gap-1 overflow-x-auto rounded-card bg-white p-1 ring-1 ring-line">
        {PORTAL_TABS.map((x) => (
          <Link key={x} to={`/app/portal/${child.id}/${x}`} aria-current={active === x ? 'page' : undefined}
            className={cn('whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold', active === x ? 'bg-brand-600 text-white' : 'text-muted hover:bg-canvas')}>{t(`portal.tabs.${x}`)}</Link>
        ))}
      </nav>
      {active === 'attendance' && <AttendanceTab id={child.id} />}
      {active === 'results' && <ResultsTab id={child.id} />}
      {active === 'fees' && <FeesTab id={child.id} />}
      {active === 'homework' && <HomeworkTab id={child.id} />}
      {active === 'library' && <LibraryTab id={child.id} />}
      {active === 'transport' && <TransportTab id={child.id} />}
      {active === 'hostel' && <HostelTab id={child.id} />}
      {active === 'timetable' && <TimetableTab id={child.id} />}
      {active === 'calendar' && <CalendarTab />}
    </div>
  );
}
