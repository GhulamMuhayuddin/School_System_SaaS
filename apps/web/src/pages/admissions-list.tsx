import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Select } from '@/components/ui/input';
import { useAuth } from '@/features/auth/auth-context';
import { ADMISSION_STATUSES, useApplications, type AdmissionStatus, type ApplicationRow } from '@/features/admissions/admissions-api';
import { PageHeader, fmtDate, platformError } from '@/features/platform/common';

export const admissionTone = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger' } as const;

export default function AdmissionsListPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<AdmissionStatus | ''>('PENDING');
  const { data, isLoading, error, refetch } = useApplications({ status: status || undefined });
  const columns: Column<ApplicationRow>[] = [
    { key: 'no', header: t('admissions.applicationNo'), sortValue: (r) => r.applicationNo, cell: (r) => <Link to={`/app/admissions/${r.id}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline" dir="ltr">{r.applicationNo}</Link> },
    { key: 'name', header: t('admissions.applicant'), sortValue: (r) => `${r.firstName} ${r.lastName}`, cell: (r) => <span className="font-semibold">{r.firstName} {r.lastName}</span> },
    { key: 'class', header: t('admissions.appliedClass'), sortValue: (r) => r.appliedClass.name, cell: (r) => r.appliedClass.name },
    { key: 'guardian', header: t('students.primaryGuardian'), cell: (r) => <span>{r.guardianName}<span className="block text-xs text-muted" dir="ltr">{r.guardianPhone}</span></span> },
    { key: 'date', header: t('admissions.appliedOn'), sortValue: (r) => r.applicationDate, cell: (r) => fmtDate(r.applicationDate, i18n.language) },
    { key: 'status', header: t('platform.schools.status'), cell: (r) => <Badge tone={admissionTone[r.status]}>{t(`admissions.statuses.${r.status}`)}</Badge> },
  ];
  return (
    <div>
      <PageHeader title={t('admissions.title')} subtitle={t('admissions.subtitle')}
        action={can('admission.create') ? <Button onClick={() => navigate('/app/admissions/new')}><Plus className="size-4" aria-hidden />{t('admissions.add')}</Button> : undefined} />
      <DataTable columns={columns} rows={data?.applications ?? []} rowKey={(r) => r.id} pageSize={15}
        searchText={(r) => `${r.firstName} ${r.lastName} ${r.applicationNo} ${r.guardianName} ${r.guardianPhone}`}
        loading={isLoading} error={error ? platformError(t, error) : null} onRetry={() => void refetch()}
        emptyTitle={t('admissions.emptyTitle')} emptyDescription={t('admissions.emptyBody')}
        toolbar={
          <Select aria-label={t('platform.schools.status')} value={status} onChange={(e) => setStatus(e.target.value as AdmissionStatus | '')} className="w-auto">
            <option value="">{t('students.allStatuses')}</option>
            {ADMISSION_STATUSES.map((s) => <option key={s} value={s}>{t(`admissions.statuses.${s}`)}</option>)}
          </Select>
        } />
    </div>
  );
}
