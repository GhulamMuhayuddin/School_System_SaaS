import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rangeArrow } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { ApplyLeaveModal, DecisionModal, LeaveTypeModal } from '@/features/hr/leave-modals';
import {
  LEAVE_STATUSES, leaveTone, useBalances, useCancelLeave, useDefaultLeaveTypes, useLeaveRequests, useLeaveTypes, useUpdateLeaveType,
  type LeaveRequest, type LeaveStatus, type LeaveType,
} from '@/features/hr/hr-api';
import { PageHeader, fmtDate, platformError } from '@/features/platform/common';
import { cn } from '@/lib/cn';

type Tab = 'mine' | 'requests' | 'types';

const StatusBadge = ({ status }: { status: LeaveStatus }) => {
  const { t } = useTranslation();
  return <Badge tone={leaveTone(status)}>{t(`leave.statuses.${status}`)}</Badge>;
};

function MineTab() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [applying, setApplying] = useState(false);
  const year = new Date().getFullYear();
  const balances = useBalances(year);
  const mine = useLeaveRequests({ mine: true });
  const cancel = useCancelLeave();
  const columns: Column<LeaveRequest>[] = [
    { key: 'no', header: t('leave.requestNo'), sortValue: (r) => r.requestNo, cell: (r) => <span dir="ltr">{r.requestNo}</span> },
    { key: 'type', header: t('leave.type'), sortValue: (r) => r.leaveType.name, cell: (r) => r.leaveType.name },
    { key: 'dates', header: t('leave.dates'), sortValue: (r) => r.fromDate, cell: (r) => <span>{fmtDate(r.fromDate, i18n.language)} {rangeArrow(i18n.language)} {fmtDate(r.toDate, i18n.language)}<span className="block text-xs text-muted">{t('leave.daysCount', { count: r.days })}</span></span> },
    { key: 'status', header: t('leave.status'), sortValue: (r) => r.status, cell: (r) => <span><StatusBadge status={r.status} />{r.decisionNote ? <span className="block text-xs text-muted">{r.decisionNote}</span> : null}</span> },
    { key: 'x', header: '', sortValue: () => '', cell: (r) => (r.status === 'PENDING'
      ? <Button size="sm" variant="ghost" onClick={() => void cancel.mutateAsync(r.id).then(() => toast.success(t('leave.cancelled')), (e) => toast.error(t('platform.errors.generic'), platformError(t, e)))}>{t('leave.withdraw')}</Button> : null) },
  ];
  return (
    <div className="space-y-4">
      {balances.error ? <p className="rounded-card bg-amber-50 p-3 text-sm text-amber-900">{platformError(t, balances.error)}</p> : null}
      {balances.data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {balances.data.balances.map((b) => (
            <Card key={b.leaveType.id} className="p-4">
              <p className="text-xs text-muted">{b.leaveType.name}{b.leaveType.paid ? '' : ` (${t('leave.unpaid')})`}</p>
              <p className="text-xl font-extrabold text-navy-900" dir="ltr">{b.balance.remaining === null ? '∞' : `${b.balance.remaining} / ${b.balance.quota}`}</p>
              <p className="text-xs text-muted">{t('leave.usedPending', { used: b.balance.used, pending: b.balance.pending })}</p>
            </Card>
          ))}
        </div>
      ) : null}
      <div><Button onClick={() => setApplying(true)}><Plus className="size-4" aria-hidden />{t('leave.apply')}</Button></div>
      <DataTable columns={columns} rows={mine.data?.requests ?? []} rowKey={(r) => r.id} pageSize={10} searchText={(r) => `${r.requestNo} ${r.leaveType.name}`}
        loading={mine.isLoading} error={mine.error ? platformError(t, mine.error) : null} onRetry={() => void mine.refetch()}
        emptyTitle={t('leave.mineEmptyTitle')} emptyDescription={t('leave.mineEmptyBody')} />
      {applying ? <ApplyLeaveModal onClose={() => setApplying(false)} /> : null}
    </div>
  );
}

function RequestsTab() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<LeaveStatus | ''>('PENDING');
  const [deciding, setDeciding] = useState<{ request: LeaveRequest; action: 'approve' | 'reject' } | null>(null);
  const [onBehalf, setOnBehalf] = useState(false);
  const list = useLeaveRequests({ status: status || undefined });
  const cancel = useCancelLeave();
  const approver = can('leave.approve');
  const columns: Column<LeaveRequest>[] = [
    { key: 'staff', header: t('leave.staff'), sortValue: (r) => r.staff.name, cell: (r) => <span>{r.staff.name}<span className="block text-xs text-muted" dir="ltr">{r.staff.employeeNo}</span></span> },
    { key: 'type', header: t('leave.type'), sortValue: (r) => r.leaveType.name, cell: (r) => <span>{r.leaveType.name}<span className="block text-xs text-muted" dir="ltr">{r.requestNo}</span></span> },
    { key: 'dates', header: t('leave.dates'), sortValue: (r) => r.fromDate, cell: (r) => <span>{fmtDate(r.fromDate, i18n.language)} {rangeArrow(i18n.language)} {fmtDate(r.toDate, i18n.language)}<span className="block text-xs text-muted">{t('leave.daysCount', { count: r.days })}</span></span> },
    { key: 'reason', header: t('leave.reason'), sortValue: (r) => r.reason ?? '', cell: (r) => r.reason ?? '—' },
    { key: 'status', header: t('leave.status'), sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    ...(approver ? [{ key: 'x', header: '', sortValue: () => '', cell: (r: LeaveRequest) => (
      <span className="flex gap-1">
        {r.status === 'PENDING' ? <><Button size="sm" onClick={() => setDeciding({ request: r, action: 'approve' })}>{t('leave.approve')}</Button><Button size="sm" variant="ghost" onClick={() => setDeciding({ request: r, action: 'reject' })}>{t('leave.reject')}</Button></> : null}
        {r.status === 'APPROVED' ? <Button size="sm" variant="ghost" onClick={() => void cancel.mutateAsync(r.id).then(() => toast.success(t('leave.cancelled')), (e) => toast.error(t('platform.errors.generic'), platformError(t, e)))}>{t('leave.undo')}</Button> : null}
      </span>) }] : []),
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-44">
          <Field id="lv-status" label={t('leave.status')}>
            <Select id="lv-status" value={status} onChange={(e) => setStatus(e.target.value as LeaveStatus | '')}>
              <option value="">{t('leave.allStatuses')}</option>{LEAVE_STATUSES.map((s) => <option key={s} value={s}>{t(`leave.statuses.${s}`)}</option>)}
            </Select>
          </Field>
        </div>
        {approver ? <Button onClick={() => setOnBehalf(true)}><Plus className="size-4" aria-hidden />{t('leave.applyFor')}</Button> : null}
      </div>
      <DataTable columns={columns} rows={list.data?.requests ?? []} rowKey={(r) => r.id} pageSize={15} searchText={(r) => `${r.staff.name} ${r.staff.employeeNo} ${r.requestNo} ${r.leaveType.name}`}
        loading={list.isLoading} error={list.error ? platformError(t, list.error) : null} onRetry={() => void list.refetch()}
        emptyTitle={t('leave.requestsEmptyTitle')} emptyDescription={t('leave.requestsEmptyBody')} />
      {list.data?.truncated ? <p className="mt-2 text-xs text-muted">{t('leave.truncated')}</p> : null}
      {deciding ? <DecisionModal request={deciding.request} action={deciding.action} onClose={() => setDeciding(null)} /> : null}
      {onBehalf ? <ApplyLeaveModal onBehalf onClose={() => setOnBehalf(false)} /> : null}
    </div>
  );
}

function TypesTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const [retired, setRetired] = useState(false);
  const [editing, setEditing] = useState<LeaveType | 'new' | null>(null);
  const types = useLeaveTypes(retired);
  const update = useUpdateLeaveType();
  const defaults = useDefaultLeaveTypes();
  const addDefaults = () => void defaults.mutateAsync().then((r) => toast.success(t('leave.defaultsAdded', { count: r.created })), (e) => toast.error(t('platform.errors.generic'), platformError(t, e)));
  const toggle = (x: LeaveType) => void update.mutateAsync({ id: x.id, patch: { active: !x.active } }).catch((e) => toast.error(t('platform.errors.generic'), platformError(t, e)));
  const columns: Column<LeaveType>[] = [
    { key: 'name', header: t('leave.typeName'), sortValue: (x) => x.name, cell: (x) => <button type="button" className="text-start font-semibold text-brand-700 hover:underline" onClick={() => setEditing(x)}>{x.name}</button> },
    { key: 'quota', header: t('leave.yearlyQuota'), sortValue: (x) => x.yearlyQuota ?? 9999, cell: (x) => <span dir="ltr">{x.yearlyQuota ?? t('leave.noLimit')}</span> },
    { key: 'paid', header: t('leave.pay'), sortValue: (x) => (x.paid ? 1 : 0), cell: (x) => <Badge tone={x.paid ? 'success' : 'warning'}>{x.paid ? t('leave.paid') : t('leave.unpaid')}</Badge> },
    { key: 'active', header: t('leave.status'), sortValue: (x) => (x.active ? 1 : 0), cell: (x) => <Button size="sm" variant="ghost" onClick={() => toggle(x)}>{x.active ? t('leave.deactivate') : t('leave.activate')}</Button> },
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={retired} onChange={(e) => setRetired(e.target.checked)} />{t('leave.showInactive')}</label>
        <Button onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden />{t('leave.addType')}</Button>
        <Button variant="secondary" onClick={addDefaults} loading={defaults.isPending}>{t('leave.addDefaults')}</Button>
      </div>
      <DataTable columns={columns} rows={types.data ?? []} rowKey={(x) => x.id} pageSize={15} searchText={(x) => x.name}
        loading={types.isLoading} error={types.error ? platformError(t, types.error) : null} onRetry={() => void types.refetch()}
        emptyTitle={t('leave.typesEmptyTitle')} emptyDescription={t('leave.typesEmptyBody')} />
      {editing ? <LeaveTypeModal key={editing === 'new' ? 'new' : editing.id} type={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

export default function LeavePage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('mine');
  const tabs: Tab[] = ['mine', ...(can('leave.read') || can('leave.approve') ? (['requests'] as Tab[]) : []), ...(can('leave.read') && can('staff.update') ? (['types'] as Tab[]) : [])];
  return (
    <div className="space-y-5">
      <PageHeader title={t('leave.title')} subtitle={t('leave.subtitle')} />
      <nav aria-label={t('leave.sections')} className="flex gap-1 overflow-x-auto rounded-card bg-white p-1 ring-1 ring-line">
        {tabs.map((x) => (
          <button key={x} type="button" aria-current={tab === x ? 'page' : undefined} onClick={() => setTab(x)}
            className={cn('whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold', tab === x ? 'bg-brand-600 text-white' : 'text-muted hover:bg-canvas')}>{t(`leave.tabs.${x}`)}</button>
        ))}
      </nav>
      {tab === 'mine' && <MineTab />}
      {tab === 'requests' && <RequestsTab />}
      {tab === 'types' && <TypesTab />}
    </div>
  );
}
