import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Select } from '@/components/ui/input';
import { useAuth } from '@/features/auth/auth-context';
import { downloadCsv } from '@/lib/csv';
import { PageHeader, platformError } from '@/features/platform/common';
import { STATUSES, useStudentOptions, useStudents, type StudentRow, type StudentStatus } from '@/features/students/students-api';

const tone = { ACTIVE: 'success', WITHDRAWN: 'neutral', TRANSFERRED: 'warning', GRADUATED: 'brand' } as const;

export default function StudentsListPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [status, setStatus] = useState<StudentStatus | ''>('ACTIVE');
  const options = useStudentOptions();
  const { data, isLoading, error, refetch } = useStudents({ classId: classId || undefined, sectionId: sectionId || undefined, status: status || undefined });
  const sections = options.data?.find((c) => c.id === classId)?.sections ?? [];

  const columns: Column<StudentRow>[] = [
    { key: 'no', header: t('students.admissionNo'), sortValue: (r) => r.admissionNo, cell: (r) => <span dir="ltr" className="font-mono text-xs">{r.admissionNo}</span> },
    { key: 'name', header: t('platform.admins.name'), sortValue: (r) => `${r.firstName} ${r.lastName}`, cell: (r) => <Link to={`/app/students/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.firstName} {r.lastName}</Link> },
    { key: 'class', header: t('students.class'), sortValue: (r) => r.class.name, cell: (r) => `${r.class.name}${r.section ? ` – ${r.section.name}` : ''}` },
    { key: 'gender', header: t('students.gender'), cell: (r) => t(`students.genders.${r.gender}`) },
    { key: 'guardian', header: t('students.primaryGuardian'), sortValue: (r) => r.primaryGuardian?.name ?? '', cell: (r) => (r.primaryGuardian ? <span>{r.primaryGuardian.name}<span className="block text-xs text-muted" dir="ltr">{r.primaryGuardian.phone}</span></span> : '—') },
    { key: 'status', header: t('platform.schools.status'), cell: (r) => <Badge tone={tone[r.status]}>{t(`students.statuses.${r.status}`)}</Badge> },
  ];

  return (
    <div>
      <PageHeader title={t('students.title')} subtitle={t('students.subtitle', { count: data?.total ?? 0 })}
        action={(
          <div className="flex flex-wrap items-center gap-3">
            <Link to={`/app/students/id-cards?${new URLSearchParams({ ...(classId ? { classId } : {}), ...(sectionId ? { sectionId } : {}) }).toString()}`} className="text-sm font-semibold text-brand-700 hover:underline">{t('print.actions.idCards')}</Link>
            <Button variant="secondary" disabled={!data?.students.length} onClick={() => downloadCsv('students', ['Admission No', 'First name', 'Last name', 'Gender', 'Class', 'Section', 'Status', 'Guardian', 'Guardian phone'],
              (data?.students ?? []).map((r) => [r.admissionNo, r.firstName, r.lastName, r.gender, r.class.name, r.section?.name, r.status, r.primaryGuardian?.name, r.primaryGuardian?.phone]))}>{t('print.actions.exportCsv')}</Button>
            {can('student.create') ? <Button onClick={() => navigate('/app/students/new')}><Plus className="size-4" aria-hidden />{t('students.add')}</Button> : null}
          </div>
        )} />
      <DataTable columns={columns} rows={data?.students ?? []} rowKey={(r) => r.id} pageSize={15}
        searchText={(r) => `${r.firstName} ${r.lastName} ${r.admissionNo} ${r.primaryGuardian?.name ?? ''} ${r.primaryGuardian?.phone ?? ''}`}
        loading={isLoading} error={error ? platformError(t, error) : null} onRetry={() => void refetch()}
        emptyTitle={t('students.emptyTitle')} emptyDescription={t('students.emptyBody')}
        toolbar={
          <div className="flex flex-wrap gap-2">
            <Select aria-label={t('students.class')} value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(''); }} className="w-auto">
              <option value="">{t('students.allClasses')}</option>
              {(options.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select aria-label={t('students.section')} value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId} className="w-auto">
              <option value="">{t('students.allSections')}</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Select aria-label={t('platform.schools.status')} value={status} onChange={(e) => setStatus(e.target.value as StudentStatus | '')} className="w-auto">
              <option value="">{t('students.allStatuses')}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`students.statuses.${s}`)}</option>)}
            </Select>
          </div>
        } />
    </div>
  );
}
