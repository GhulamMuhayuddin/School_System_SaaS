import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { downloadCsv } from '@/lib/csv';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input, Select } from '@/components/ui/input';
import { fmtMoney, useDefaulters, useFeeSummary, type Defaulter } from '@/features/fees/fees-api';
import { FeesTabs } from '@/features/fees/fees-tabs';
import { PageHeader, fmtDate, platformError } from '@/features/platform/common';
import { useClasses } from '@/features/students/students-api';

function Stat({ label, value }: { label: string; value: string }) {
  return <Card className="p-4"><p className="text-sm text-muted">{label}</p><p dir="ltr" className="mt-1 text-xl font-bold text-navy-900">{value}</p></Card>;
}

export default function FeesReportsPage() {
  const { t, i18n } = useTranslation();
  const classes = useClasses();
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [classId, setClassId] = useState('');
  const bad = Boolean(from && to && to < from);
  const summary = useFeeSummary(bad ? '' : from, bad ? '' : to);
  const defaulters = useDefaulters(classId);
  const m = (n: number) => fmtMoney(n, i18n.language);
  const s = summary.data;
  const columns: Column<Defaulter>[] = [
    { key: 'student', header: t('fees.student'), sortValue: (d) => d.student.name, cell: (d) => `${d.student.name} (${d.student.admissionNo})` },
    { key: 'class', header: t('fees.class'), sortValue: (d) => d.className, cell: (d) => `${d.className}${d.sectionName ? ` - ${d.sectionName}` : ''}` },
    { key: 'vouchers', header: t('fees.unpaidVouchers'), sortValue: (d) => d.vouchers, cell: (d) => d.vouchers },
    { key: 'since', header: t('fees.oldestDue'), sortValue: (d) => d.oldestDueDate, cell: (d) => fmtDate(d.oldestDueDate, i18n.language) },
    { key: 'balance', header: t('fees.balance'), sortValue: (d) => d.balance, cell: (d) => <span dir="ltr" className="font-semibold">{m(d.balance)}</span> },
  ];
  return (
    <div>
      <PageHeader title={t('fees.title')} subtitle={t('fees.reportsSubtitle')} />
      <FeesTabs />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        <Field id="r-from" label={t('fees.from')}><Input id="r-from" type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field id="r-to" label={t('fees.to')} error={bad ? t('attendance.rangeInvalid') : undefined}><Input id="r-to" type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      {summary.error ? <p className="mb-4 text-sm text-rose-700">{platformError(t, summary.error)}</p> : null}
      {s ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t('fees.collectedInRange')} value={m(s.collected)} />
          <Stat label={t('fees.totalBilled')} value={m(s.billed)} />
          <Stat label={t('fees.outstanding')} value={m(s.balance)} />
          <Stat label={t('fees.overdueAmount')} value={m(s.overdueBalance)} />
        </div>
      ) : null}
      {s && s.byMethod.length ? <p className="mb-6 text-sm text-muted">{s.byMethod.map((x) => `${t(`fees.methods.${x.method}`)}: ${m(x.amount)}`).join(' · ')} · {t('fees.receiptCount', { count: s.receipts })}</p> : null}
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold text-navy-900">{t('fees.defaulters')}</h2>
        <Button variant="secondary" disabled={!defaulters.data?.length} onClick={() => downloadCsv('fee-defaulters', ['Admission No', 'Student', 'Class', 'Section', 'Unpaid vouchers', 'Oldest due date', 'Balance'],
          (defaulters.data ?? []).map((d) => [d.student.admissionNo, d.student.name, d.className, d.sectionName, d.vouchers, d.oldestDueDate.slice(0, 10), d.balance]))}>{t('print.actions.exportCsv')}</Button>
      </div>
      <div className="mb-3 max-w-xs">
        <Field id="d-class" label={t('fees.class')}>
          <Select id="d-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{t('fees.allClasses')}</option>{(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </div>
      <DataTable columns={columns} rows={defaulters.data ?? []} rowKey={(d) => d.student.id} pageSize={15} searchText={(d) => `${d.student.name} ${d.student.admissionNo}`}
        loading={defaulters.isLoading} error={defaulters.error ? platformError(t, defaulters.error) : null} onRetry={() => void defaulters.refetch()}
        emptyTitle={t('fees.noDefaulters')} emptyDescription={t('fees.noDefaultersBody')} />
    </div>
  );
}
