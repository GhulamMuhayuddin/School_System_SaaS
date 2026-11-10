import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Select } from '@/components/ui/input';
import { useAuth } from '@/features/auth/auth-context';
import { PageHeader, platformError } from '@/features/platform/common';
import { CATEGORIES, STAFF_STATUSES, useStaffList, type StaffCategory, type StaffRow, type StaffStatus } from '@/features/staff/staff-api';

export default function StaffListPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [category, setCategory] = useState<StaffCategory | ''>('');
  const [status, setStatus] = useState<StaffStatus | ''>('ACTIVE');
  const { data, isLoading, error, refetch } = useStaffList({ category: category || undefined, status: status || undefined });

  const columns: Column<StaffRow>[] = [
    { key: 'no', header: t('staff.employeeNo'), sortValue: (r) => r.employeeNo, cell: (r) => <span dir="ltr" className="font-mono text-xs">{r.employeeNo}</span> },
    { key: 'name', header: t('platform.admins.name'), sortValue: (r) => `${r.firstName} ${r.lastName}`, cell: (r) => <Link to={`/app/staff/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.firstName} {r.lastName}</Link> },
    { key: 'designation', header: t('staff.designation'), sortValue: (r) => r.designation, cell: (r) => r.designation },
    { key: 'category', header: t('staff.category'), cell: (r) => t(`staff.categories.${r.category}`) },
    { key: 'phone', header: t('students.phone'), cell: (r) => <span dir="ltr">{r.phone}</span> },
    { key: 'login', header: t('staff.login'), cell: (r) => (r.hasAccount ? <Badge tone="success">{t('staff.hasLogin')}</Badge> : '—') },
    { key: 'status', header: t('platform.schools.status'), cell: (r) => <Badge tone={r.status === 'ACTIVE' ? 'success' : 'neutral'}>{t(`staff.statuses.${r.status}`)}</Badge> },
  ];

  return (
    <div>
      <PageHeader title={t('staff.title')} subtitle={t('staff.subtitle', { count: data?.total ?? 0 })}
        action={can('staff.create') ? <Button onClick={() => navigate('/app/staff/new')}><Plus className="size-4" aria-hidden />{t('staff.add')}</Button> : undefined} />
      <DataTable columns={columns} rows={data?.staff ?? []} rowKey={(r) => r.id} pageSize={15}
        searchText={(r) => `${r.firstName} ${r.lastName} ${r.employeeNo} ${r.designation} ${r.phone}`}
        loading={isLoading} error={error ? platformError(t, error) : null} onRetry={() => void refetch()}
        emptyTitle={t('staff.emptyTitle')} emptyDescription={t('staff.emptyBody')}
        toolbar={
          <div className="flex flex-wrap gap-2">
            <Select aria-label={t('staff.category')} value={category} onChange={(e) => setCategory(e.target.value as StaffCategory | '')} className="w-auto">
              <option value="">{t('staff.allCategories')}</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{t(`staff.categories.${c}`)}</option>)}
            </Select>
            <Select aria-label={t('platform.schools.status')} value={status} onChange={(e) => setStatus(e.target.value as StaffStatus | '')} className="w-auto">
              <option value="">{t('students.allStatuses')}</option>
              {STAFF_STATUSES.map((s) => <option key={s} value={s}>{t(`staff.statuses.${s}`)}</option>)}
            </Select>
          </div>
        } />
    </div>
  );
}
