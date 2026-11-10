import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Select } from '@/components/ui/input';
import { PageHeader, fmtDateTime, platformError } from '@/features/platform/common';
import { useAuditLogs, type AuditLog } from '@/features/platform/platform-api';

const GROUPS = ['', 'platform.', 'auth.login', 'auth.password', 'auth.logout'] as const;

export default function PlatformLogsPage() {
  const { t, i18n } = useTranslation();
  const [group, setGroup] = useState<(typeof GROUPS)[number]>('');
  const { data, isLoading, error, refetch } = useAuditLogs({ action: group || undefined, limit: 200 });
  const columns: Column<AuditLog>[] = [
    { key: 'time', header: t('platform.logs.time'), sortValue: (r) => r.createdAt, cell: (r) => fmtDateTime(r.createdAt, i18n.language) },
    { key: 'action', header: t('platform.logs.action'), sortValue: (r) => r.action, cell: (r) => <code className="rounded bg-canvas px-1.5 py-0.5 text-xs" dir="ltr">{r.action}</code> },
    { key: 'user', header: t('platform.logs.user'), sortValue: (r) => r.user?.email ?? '', cell: (r) => <span dir="ltr">{r.user?.email ?? '—'}</span> },
    { key: 'school', header: t('platform.logs.school'), sortValue: (r) => r.school?.name ?? '', cell: (r) => r.school?.name ?? '—' },
    { key: 'ip', header: 'IP', cell: (r) => <span dir="ltr">{r.ip ?? '—'}</span> },
  ];
  return (
    <div>
      <PageHeader title={t('platform.logs.title')} subtitle={t('platform.logs.subtitle')} />
      <DataTable
        columns={columns} rows={data ?? []} rowKey={(r) => r.id} pageSize={15}
        searchText={(r) => `${r.action} ${r.user?.email ?? ''} ${r.school?.name ?? ''} ${r.ip ?? ''}`}
        loading={isLoading} error={error ? platformError(t, error) : null} onRetry={() => void refetch()}
        emptyTitle={t('platform.logs.emptyTitle')} emptyDescription={t('platform.logs.emptyBody')}
        toolbar={
          <Select aria-label={t('platform.logs.filter')} value={group} onChange={(e) => setGroup(e.target.value as (typeof GROUPS)[number])} className="w-auto">
            {GROUPS.map((g) => <option key={g} value={g}>{t(`platform.logs.group.${g || 'all'}`)}</option>)}
          </Select>
        }
      />
    </div>
  );
}
