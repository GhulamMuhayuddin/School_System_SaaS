import { ArrowLeft, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/modal';
import { ErrorState, Spinner } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { fmtMoney } from '@/features/fees/fees-api';
import { periodLabel, useDeleteRun, useRun, useRunAction, useRuns, useSalaries, type Payslip, type RunSummary, type SalaryRow } from '@/features/hr/hr-api';
import { NewRunModal, PayModal, SalaryModal, SlipEditModal, VoidPaymentModal } from '@/features/hr/payroll-modals';
import { PageHeader, platformError } from '@/features/platform/common';
import { cn } from '@/lib/cn';

type Tab = 'runs' | 'salaries';

function RunDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const run = useRun(id);
  const action = useRunAction();
  const del = useDeleteRun();
  const [editing, setEditing] = useState<Payslip | null>(null);
  const [paying, setPaying] = useState<Payslip | null>(null);
  const [voiding, setVoiding] = useState<Payslip | null>(null);
  const [confirm, setConfirm] = useState<'finalize' | 'reopen' | 'delete' | null>(null);
  const manage = can('payroll.manage');
  const canPay = can('accounts.manage');
  const money = (n: number) => <span dir="ltr">{fmtMoney(n, i18n.language)}</span>;
  if (run.isLoading) return <Spinner />;
  if (run.error || !run.data) return <ErrorState title={t('platform.errors.generic')} description={run.error ? platformError(t, run.error) : undefined} onRetry={() => void run.refetch()} />;
  const r = run.data;
  const draft = r.status === 'DRAFT';
  const fail = (e: unknown) => toast.error(t('platform.errors.generic'), platformError(t, e));
  const doAction = (a: 'regenerate' | 'finalize' | 'reopen') => void action.mutateAsync({ id, action: a }).then(() => { toast.success(t(`payroll.done.${a}`)); setConfirm(null); }, (e) => { setConfirm(null); fail(e); });
  const doDelete = () => void del.mutateAsync(id).then(() => { toast.success(t('payroll.done.delete')); onBack(); }, (e) => { setConfirm(null); fail(e); });
  const chip = (label: string, value: string | number) => <Card key={label} className="p-4"><p className="text-xs text-muted">{label}</p><p className="text-xl font-extrabold text-navy-900" dir="ltr">{value}</p></Card>;
  const columns: Column<Payslip>[] = [
    { key: 'staff', header: t('payroll.staff'), sortValue: (s) => s.staff.name, cell: (s) => <span>{s.staff.name}<span className="block text-xs text-muted"><span dir="ltr">{s.staff.employeeNo}</span> · <span dir="ltr">{s.slipNo}</span></span></span> },
    { key: 'gross', header: t('payroll.gross'), sortValue: (s) => s.gross, cell: (s) => money(s.gross) },
    { key: 'days', header: t('payroll.unpaidDays'), sortValue: (s) => s.deductionDays, cell: (s) => <span title={t('payroll.daysBreakdown', { absent: s.absentDays, leave: s.unpaidLeaveDays, outside: s.outsideDays })} dir="ltr">{s.deductionDays}</span> },
    { key: 'att', header: t('payroll.attendanceDeduction'), sortValue: (s) => s.attendanceDeduction, cell: (s) => money(s.attendanceDeduction) },
    { key: 'fixed', header: t('payroll.fixedDeduction'), sortValue: (s) => s.fixedDeduction, cell: (s) => money(s.fixedDeduction) },
    { key: 'adj', header: t('payroll.adjustments'), sortValue: (s) => s.bonus - s.otherDeduction, cell: (s) => <span>{s.bonus > 0 ? <span className="block text-emerald-700" dir="ltr">+{fmtMoney(s.bonus, i18n.language)}</span> : null}{s.otherDeduction > 0 ? <span className="block text-rose-700" dir="ltr">-{fmtMoney(s.otherDeduction, i18n.language)}</span> : null}{s.bonus === 0 && s.otherDeduction === 0 ? '—' : null}</span> },
    { key: 'net', header: t('payroll.net'), sortValue: (s) => s.net, cell: (s) => <b>{money(s.net)}</b> },
    { key: 'paid', header: t('payroll.status'), sortValue: (s) => (s.paid ? 1 : 0), cell: (s) => (
      <span><Badge tone={s.paid ? 'success' : s.paymentVoided ? 'danger' : 'warning'}>{s.paid ? t('payroll.paidStatus') : s.paymentVoided ? t('payroll.voidedStatus') : t('payroll.unpaidStatus')}</Badge>
        {s.paid && s.accountEntryNo ? <span className="block text-xs text-muted" dir="ltr">{s.accountEntryNo}</span> : null}</span>) },
    { key: 'print', header: '', sortValue: () => '', cell: (s: Payslip) => (draft ? null : <Link to={`/app/payslips/${s.id}/print`} className="rounded-control px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">{t('payroll.printSlip')}</Link>) },
    ...(manage || canPay ? [{ key: 'x', header: '', sortValue: () => '', cell: (s: Payslip) => (
      <span className="flex gap-1">
        {draft && manage ? <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>{t('payroll.edit')}</Button> : null}
        {!draft && canPay && !s.paid && s.net > 0 ? <Button size="sm" onClick={() => setPaying(s)}>{t('payroll.pay')}</Button> : null}
        {!draft && canPay && s.paid ? <Button size="sm" variant="ghost" onClick={() => setVoiding(s)}>{t('payroll.voidPayment')}</Button> : null}
      </span>) }] : []),
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{t('payroll.back')}</Button>
        <h2 className="text-lg font-bold text-navy-900">{periodLabel(r.period, i18n.language)}</h2>
        <Badge tone={draft ? 'warning' : 'success'}>{t(`payroll.runStatuses.${r.status}`)}</Badge>
        {manage && draft ? <>
          <Button size="sm" variant="secondary" onClick={() => doAction('regenerate')} loading={action.isPending}>{t('payroll.recalculate')}</Button>
          <Button size="sm" onClick={() => setConfirm('finalize')} disabled={r.payslips.length === 0}>{t('payroll.finalize')}</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm('delete')}>{t('payroll.deleteRun')}</Button>
        </> : null}
        {manage && !draft ? <Button size="sm" variant="secondary" onClick={() => setConfirm('reopen')}>{t('payroll.reopen')}</Button> : null}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {chip(t('payroll.slips'), r.totals.slips)}{chip(t('payroll.totalNet'), fmtMoney(r.totals.net, i18n.language))}
        {chip(t('payroll.paidAmount'), fmtMoney(r.totals.paidAmount, i18n.language))}{chip(t('payroll.unpaidAmount'), fmtMoney(r.totals.unpaidAmount, i18n.language))}
      </div>
      {draft && r.skipped.length > 0 ? <p className="rounded-card bg-amber-50 p-3 text-sm text-amber-900">{t('payroll.skipped', { names: r.skipped.map((s) => s.name).join(', ') })}</p> : null}
      {draft ? <p className="text-xs text-muted">{t('payroll.draftHint')}</p> : null}
      <DataTable columns={columns} rows={r.payslips} rowKey={(s) => s.id} pageSize={20} searchText={(s) => `${s.staff.name} ${s.staff.employeeNo} ${s.slipNo}`}
        emptyTitle={t('payroll.slipsEmptyTitle')} emptyDescription={t('payroll.slipsEmptyBody')} />
      {editing ? <SlipEditModal key={editing.id} slip={editing} onClose={() => setEditing(null)} /> : null}
      {paying ? <PayModal key={paying.id} slip={paying} onClose={() => setPaying(null)} /> : null}
      {voiding ? <VoidPaymentModal key={voiding.id} slip={voiding} onClose={() => setVoiding(null)} /> : null}
      <ConfirmDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)} danger={confirm === 'delete'} loading={action.isPending || del.isPending}
        title={confirm ? t(`payroll.confirm.${confirm}Title`) : ''} description={confirm ? t(`payroll.confirm.${confirm}Body`) : undefined} confirmLabel={confirm ? t(`payroll.confirm.${confirm}Button`) : ''}
        onConfirm={() => (confirm === 'delete' ? doDelete() : confirm ? doAction(confirm) : undefined)} />
    </div>
  );
}

function RunsTab() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const runs = useRuns();
  if (open) return <RunDetail id={open} onBack={() => setOpen(null)} />;
  const columns: Column<RunSummary>[] = [
    { key: 'period', header: t('payroll.month'), sortValue: (r) => r.period, cell: (r) => <button type="button" className="text-start font-semibold text-brand-700 hover:underline" onClick={() => setOpen(r.id)}>{periodLabel(r.period, i18n.language)}</button> },
    { key: 'status', header: t('payroll.status'), sortValue: (r) => r.status, cell: (r) => <Badge tone={r.status === 'DRAFT' ? 'warning' : 'success'}>{t(`payroll.runStatuses.${r.status}`)}</Badge> },
    { key: 'slips', header: t('payroll.slips'), sortValue: (r) => r.totals.slips, cell: (r) => <span dir="ltr">{r.totals.slips}</span> },
    { key: 'net', header: t('payroll.totalNet'), sortValue: (r) => r.totals.net, cell: (r) => <span dir="ltr">{fmtMoney(r.totals.net, i18n.language)}</span> },
    { key: 'paid', header: t('payroll.paidSlips'), sortValue: (r) => r.totals.paidSlips, cell: (r) => <Badge tone={r.totals.paidSlips === r.totals.slips && r.totals.slips > 0 ? 'success' : 'neutral'}><span dir="ltr">{r.totals.paidSlips} / {r.totals.slips}</span></Badge> },
  ];
  return (
    <div>
      {can('payroll.manage') ? <div className="mb-4"><Button onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden />{t('payroll.newRun')}</Button></div> : null}
      <DataTable columns={columns} rows={runs.data ?? []} rowKey={(r) => r.id} pageSize={12} searchText={(r) => `${r.period} ${periodLabel(r.period, i18n.language)}`}
        loading={runs.isLoading} error={runs.error ? platformError(t, runs.error) : null} onRetry={() => void runs.refetch()}
        emptyTitle={t('payroll.runsEmptyTitle')} emptyDescription={t('payroll.runsEmptyBody')} />
      {adding ? <NewRunModal onClose={() => setAdding(false)} onCreated={(id) => setOpen(id)} /> : null}
    </div>
  );
}

function SalariesTab() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState<SalaryRow | null>(null);
  const rows = useSalaries({ q: q.trim() || undefined, missing });
  const manage = can('payroll.manage');
  const money = (n: number) => <span dir="ltr">{fmtMoney(n, i18n.language)}</span>;
  const columns: Column<SalaryRow>[] = [
    { key: 'staff', header: t('payroll.staff'), sortValue: (r) => r.staff.name, cell: (r) => <span>{r.staff.name}<span className="block text-xs text-muted"><span dir="ltr">{r.staff.employeeNo}</span> · {r.staff.designation}</span></span> },
    { key: 'basic', header: t('payroll.basic'), sortValue: (r) => r.salary?.basic ?? -1, cell: (r) => (r.salary ? money(r.salary.basic) : <Badge tone="warning">{t('payroll.notSet')}</Badge>) },
    { key: 'allow', header: t('payroll.allowances'), sortValue: (r) => r.salary?.allowances ?? -1, cell: (r) => (r.salary ? money(r.salary.allowances) : '—') },
    { key: 'fixed', header: t('payroll.fixedDeduction'), sortValue: (r) => r.salary?.fixedDeduction ?? -1, cell: (r) => (r.salary ? money(r.salary.fixedDeduction) : '—') },
    { key: 'gross', header: t('payroll.gross'), sortValue: (r) => r.salary?.gross ?? -1, cell: (r) => (r.salary ? <b>{money(r.salary.gross)}</b> : '—') },
    ...(manage ? [{ key: 'x', header: '', sortValue: () => '', cell: (r: SalaryRow) => <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>{r.salary ? t('payroll.edit') : t('payroll.setSalaryShort')}</Button> }] : []),
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-56"><label htmlFor="sal-q" className="mb-1 block text-sm font-medium text-navy-900">{t('payroll.search')}</label><Input id="sal-q" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} />{t('payroll.onlyMissing')}</label>
      </div>
      <DataTable columns={columns} rows={rows.data?.rows ?? []} rowKey={(r) => r.staff.id} pageSize={20} searchText={(r) => `${r.staff.name} ${r.staff.employeeNo}`}
        loading={rows.isLoading} error={rows.error ? platformError(t, rows.error) : null} onRetry={() => void rows.refetch()}
        emptyTitle={t('payroll.salariesEmptyTitle')} emptyDescription={t('payroll.salariesEmptyBody')} />
      {rows.data?.truncated ? <p className="mt-2 text-xs text-muted">{t('payroll.truncated')}</p> : null}
      {editing ? <SalaryModal key={editing.staff.id} row={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

export default function PayrollPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('runs');
  const tabs: Tab[] = ['runs', 'salaries'];
  return (
    <div className="space-y-5">
      <PageHeader title={t('payroll.title')} subtitle={t('payroll.subtitle')} />
      <nav aria-label={t('payroll.sections')} className="flex gap-1 overflow-x-auto rounded-card bg-white p-1 ring-1 ring-line">
        {tabs.map((x) => (
          <button key={x} type="button" aria-current={tab === x ? 'page' : undefined} onClick={() => setTab(x)}
            className={cn('whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold', tab === x ? 'bg-brand-600 text-white' : 'text-muted hover:bg-canvas')}>{t(`payroll.tabs.${x}`)}</button>
        ))}
      </nav>
      {tab === 'runs' && <RunsTab />}
      {tab === 'salaries' && <SalariesTab />}
    </div>
  );
}
