import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input, Select } from '@/components/ui/input';
import { useAttendanceReport, type ReportRow } from '@/features/attendance/attendance-api';
import { AttendanceTabs } from '@/features/attendance/attendance-tabs';
import { PageHeader, platformError } from '@/features/platform/common';
import { useClasses } from '@/features/students/students-api';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setUTCDate(1); return iso(d); };

export default function AttendanceReportPage() {
  const { t } = useTranslation();
  const classes = useClasses();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(iso(new Date()));
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [below, setBelow] = useState('75');
  const sections = classes.data?.find((c) => c.id === classId)?.sections ?? [];
  const report = useAttendanceReport({ from, to, classId: classId || undefined, sectionId: sectionId || undefined, below: below ? Number(below) : undefined });
  const rangeOk = to >= from;

  const columns: Column<ReportRow>[] = [
    { key: 'no', header: t('students.admissionNo'), sortValue: (r) => r.student.admissionNo, cell: (r) => <span dir="ltr" className="font-mono text-xs">{r.student.admissionNo}</span> },
    { key: 'name', header: t('platform.admins.name'), sortValue: (r) => r.student.name, cell: (r) => <Link to={`/app/students/${r.student.id}`} className="font-semibold text-brand-700 hover:underline">{r.student.name}</Link> },
    { key: 'class', header: t('students.class'), sortValue: (r) => `${r.student.className ?? ''}${r.student.sectionName ?? ''}`, cell: (r) => `${r.student.className ?? '—'}${r.student.sectionName ? ` – ${r.student.sectionName}` : ''}` },
    { key: 'present', header: t('attendance.statuses.PRESENT'), sortValue: (r) => r.totals.present, cell: (r) => r.totals.present },
    { key: 'absent', header: t('attendance.statuses.ABSENT'), sortValue: (r) => r.totals.absent, cell: (r) => r.totals.absent },
    { key: 'late', header: t('attendance.statuses.LATE'), sortValue: (r) => r.totals.late, cell: (r) => r.totals.late },
    { key: 'leave', header: t('attendance.statuses.LEAVE'), sortValue: (r) => r.totals.leave, cell: (r) => r.totals.leave },
    {
      key: 'pct', header: '%', sortValue: (r) => r.totals.percentage ?? -1,
      cell: (r) => (r.totals.percentage === null ? '—' : <Badge tone={r.totals.percentage >= 75 ? 'success' : r.totals.percentage >= 50 ? 'warning' : 'danger'}>{r.totals.percentage}%</Badge>),
    },
  ];

  return (
    <div>
      <PageHeader title={t('attendance.title')} subtitle={t('attendance.reportSubtitle')} />
      <AttendanceTabs />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field id="rp-from" label={t('attendance.from')}><Input id="rp-from" type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field id="rp-to" label={t('attendance.to')} error={rangeOk ? undefined : t('attendance.rangeInvalid')}><Input id="rp-to" type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field id="rp-class" label={t('students.class')}>
          <Select id="rp-class" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(''); }}>
            <option value="">{t('students.allClasses')}</option>
            {(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field id="rp-section" label={t('students.section')}>
          <Select id="rp-section" value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}>
            <option value="">{t('students.allSections')}</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field id="rp-below" label={t('attendance.below')} hint={t('attendance.belowHint')}>
          <Select id="rp-below" value={below} onChange={(e) => setBelow(e.target.value)}>
            <option value="">{t('attendance.everyone')}</option>
            {[50, 60, 75, 85, 90].map((n) => <option key={n} value={n}>{`< ${n}%`}</option>)}
          </Select>
        </Field>
      </div>
      <DataTable columns={columns} rows={report.data?.rows ?? []} rowKey={(r) => r.student.id} pageSize={20}
        searchText={(r) => `${r.student.name} ${r.student.admissionNo}`} loading={report.isLoading && rangeOk} error={report.error ? platformError(t, report.error) : null} onRetry={() => void report.refetch()}
        emptyTitle={t('attendance.reportEmptyTitle')} emptyDescription={t('attendance.reportEmptyBody')} />
      {report.data && report.data.total > report.data.rows.length && <p className="mt-2 text-xs text-muted">{t('attendance.reportTruncated', { shown: report.data.rows.length, total: report.data.total })}</p>}
    </div>
  );
}
