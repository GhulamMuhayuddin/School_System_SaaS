import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { downloadCsv } from '@/lib/csv';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input, Select } from '@/components/ui/input';
import { useAuth } from '@/features/auth/auth-context';
import { fmtMoney, statusTone, useVouchers, type Voucher, type VoucherStatus } from '@/features/fees/fees-api';
import { GenerateModal, VoucherModal } from '@/features/fees/fees-modals';
import { FeesTabs } from '@/features/fees/fees-tabs';
import { PageHeader, fmtDate, platformError } from '@/features/platform/common';
import { useClasses } from '@/features/students/students-api';

export default function FeesVouchersPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const classes = useClasses();
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState<VoucherStatus | ''>('');
  const [period, setPeriod] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [gen, setGen] = useState(false);
  const vouchers = useVouchers({ classId, status, period, overdue });
  const money = (n: number) => <span dir="ltr">{fmtMoney(n, i18n.language)}</span>;
  const columns: Column<Voucher>[] = [
    { key: 'no', header: t('fees.voucherNo'), sortValue: (v) => v.voucherNo, cell: (v) => <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => setOpen(v.id)}>{v.voucherNo}</button> },
    { key: 'student', header: t('fees.student'), sortValue: (v) => v.student.name, cell: (v) => `${v.student.name} (${v.student.admissionNo})` },
    { key: 'class', header: t('fees.class'), sortValue: (v) => v.className, cell: (v) => `${v.className}${v.sectionName ? ` - ${v.sectionName}` : ''}` },
    { key: 'period', header: t('fees.period'), sortValue: (v) => v.period, cell: (v) => v.period },
    { key: 'due', header: t('fees.dueDate'), sortValue: (v) => v.dueDate, cell: (v) => fmtDate(v.dueDate, i18n.language) },
    { key: 'net', header: t('fees.net'), sortValue: (v) => v.netAmount, cell: (v) => money(v.netAmount) },
    { key: 'balance', header: t('fees.balance'), sortValue: (v) => v.balance, cell: (v) => money(v.balance) },
    { key: 'status', header: t('fees.status'), sortValue: (v) => v.status, cell: (v) => <Badge tone={statusTone(v.status, v.overdue)}>{v.overdue ? t('fees.overdue') : t(`fees.statuses.${v.status}`)}</Badge> },
  ];
  return (
    <div>
      <PageHeader title={t('fees.title')} subtitle={t('fees.subtitle')}
        action={(
          <div className="flex flex-wrap items-center gap-3">
            <Link to={`/app/fees/vouchers/print?${new URLSearchParams({ ...(classId ? { classId } : {}), ...(status ? { status } : {}), ...(period ? { period } : {}), ...(overdue ? { overdue: '1' } : {}) }).toString()}`} className="text-sm font-semibold text-brand-700 hover:underline">{t('print.actions.vouchers')}</Link>
            <Button variant="secondary" disabled={!vouchers.data?.length} onClick={() => downloadCsv('fee-vouchers', ['Voucher No', 'Admission No', 'Student', 'Class', 'Section', 'Period', 'Due date', 'Net', 'Paid', 'Balance', 'Status'],
              (vouchers.data ?? []).map((v) => [v.voucherNo, v.student.admissionNo, v.student.name, v.className, v.sectionName, v.period, v.dueDate.slice(0, 10), v.netAmount, v.paidAmount, v.balance, v.overdue ? 'OVERDUE' : v.status]))}>{t('print.actions.exportCsv')}</Button>
            {can('fee.manage') ? <Button onClick={() => setGen(true)}><Plus className="size-4" aria-hidden />{t('fees.generate')}</Button> : null}
          </div>
        )} />
      <FeesTabs />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="f-class" label={t('fees.class')}>
          <Select id="f-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{t('fees.allClasses')}</option>
            {(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field id="f-status" label={t('fees.status')}>
          <Select id="f-status" value={status} onChange={(e) => setStatus(e.target.value as VoucherStatus | '')}>
            <option value="">{t('fees.allStatuses')}</option>
            {(['UNPAID', 'PARTIAL', 'PAID', 'CANCELLED'] as const).map((s) => <option key={s} value={s}>{t(`fees.statuses.${s}`)}</option>)}
          </Select>
        </Field>
        <Field id="f-period" label={t('fees.period')}><Input id="f-period" type="month" dir="ltr" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
        <label className="flex items-center gap-2 pt-7 text-sm"><input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />{t('fees.onlyOverdue')}</label>
      </div>
      <DataTable columns={columns} rows={vouchers.data ?? []} rowKey={(v) => v.id} pageSize={15} searchText={(v) => `${v.voucherNo} ${v.student.name} ${v.student.admissionNo}`}
        loading={vouchers.isLoading} error={vouchers.error ? platformError(t, vouchers.error) : null} onRetry={() => void vouchers.refetch()}
        emptyTitle={t('fees.emptyTitle')} emptyDescription={t('fees.emptyBody')} />
      <VoucherModal id={open} onClose={() => setOpen(null)} />
      {gen ? <GenerateModal open onClose={() => setGen(false)} /> : null}
    </div>
  );
}
