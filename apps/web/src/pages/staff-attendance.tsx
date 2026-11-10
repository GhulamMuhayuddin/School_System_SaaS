import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { tally, thisMonth, useMarkStaff, useStaffMonthly, useStaffRoster, type AttendanceStatus, type StaffRoster } from '@/features/attendance/attendance-api';
import { AttendanceTabs } from '@/features/attendance/attendance-tabs';
import { MonthlyGrid } from '@/features/attendance/monthly-grid';
import { StatusPicker } from '@/features/attendance/status-picker';
import { PageHeader, platformError } from '@/features/platform/common';

function StaffEditor({ roster }: { roster: StaffRoster }) {
  const { t } = useTranslation();
  const toast = useToast();
  const mark = useMarkStaff();
  const [draft, setDraft] = useState<Record<string, AttendanceStatus | null>>(() => Object.fromEntries(roster.staff.map((s) => [s.id, s.status])));
  const editable = !roster.holiday && roster.date <= roster.today;
  const counts = tally(roster.staff.map((s) => draft[s.id] ?? null));
  const complete = counts.UNMARKED === 0;
  const dirty = roster.staff.some((s) => (draft[s.id] ?? null) !== s.status);
  const save = async () => {
    try {
      await mark.mutateAsync({ date: roster.date, entries: roster.staff.map((s) => ({ id: s.id, status: draft[s.id]!, remark: s.remark })) });
      toast.success(t('attendance.saved'));
    } catch (e) {
      toast.error(t('platform.errors.generic'), platformError(t, e));
    }
  };
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <p className="text-xs font-bold text-muted">{t('attendance.statuses.PRESENT')}: {counts.PRESENT} · {t('attendance.statuses.ABSENT')}: {counts.ABSENT} · {t('attendance.statuses.LATE')}: {counts.LATE} · {t('attendance.statuses.LEAVE')}: {counts.LEAVE}{counts.UNMARKED > 0 ? ` · ${t('attendance.unmarked')}: ${counts.UNMARKED}` : ''}</p>
        {editable && <Button variant="secondary" size="sm" onClick={() => setDraft(Object.fromEntries(roster.staff.map((s) => [s.id, 'PRESENT' as const])))}>{t('attendance.markAllPresent')}</Button>}
      </div>
      <ul className="divide-y divide-line/70">
        {roster.staff.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-navy-900">{s.name}</p>
              <p className="text-xs text-muted"><span dir="ltr">{s.employeeNo}</span> · {s.designation}</p>
            </div>
            <StatusPicker name={s.name} value={draft[s.id] ?? null} disabled={!editable} onChange={(st) => setDraft((d) => ({ ...d, [s.id]: st }))} />
          </li>
        ))}
      </ul>
      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
          <p className="text-xs text-muted">{complete ? t('attendance.readyToSave') : t('attendance.markEveryone')}</p>
          <Button onClick={() => void save()} disabled={!complete || !dirty} loading={mark.isPending}>{t('attendance.save')}</Button>
        </div>
      )}
    </Card>
  );
}

export default function StaffAttendancePage() {
  const { t } = useTranslation();
  const [view, setView] = useState<'day' | 'month'>('day');
  const [date, setDate] = useState('');
  const [month, setMonth] = useState(thisMonth());
  const roster = useStaffRoster(date, view === 'day');
  const monthly = useStaffMonthly(month, view === 'month');
  const r = roster.data;
  const m = monthly.data;
  return (
    <div>
      <PageHeader title={t('attendance.title')} subtitle={t('attendance.staffSubtitle')} />
      <AttendanceTabs />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div role="tablist" aria-label={t('attendance.tabStaff')} className="flex gap-1 rounded-control bg-white p-1 ring-1 ring-line">
          {(['day', 'month'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={view === v ? 'rounded-md bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white' : 'rounded-md px-4 py-1.5 text-sm font-semibold text-muted hover:bg-canvas'}>
              {t(v === 'day' ? 'attendance.viewDay' : 'attendance.viewMonth')}
            </button>
          ))}
        </div>
        {view === 'day'
          ? <Field id="sa-date" label={t('attendance.date')}><Input id="sa-date" type="date" dir="ltr" value={date || r?.date || ''} max={r?.today} onChange={(e) => setDate(e.target.value)} /></Field>
          : <Field id="sa-month" label={t('attendance.month')}><Input id="sa-month" type="month" dir="ltr" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></Field>}
      </div>
      {view === 'day' ? (
        roster.error ? <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, roster.error)} onRetry={() => void roster.refetch()} /> : !r ? <Skeleton className="h-64" /> : (
          <div className="space-y-4">
            {r.holiday && <p role="status" className="rounded-control bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{t('attendance.holiday', { title: r.holiday.title })}</p>}
            {r.date > r.today && <p role="status" className="rounded-control bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700">{t('attendance.blocked.FUTURE_DATE')}</p>}
            {r.staff.length === 0 ? <EmptyState title={t('attendance.noStaff')} description={t('attendance.noStaffBody')} /> : <StaffEditor key={`${r.date}-${r.staff.map((s) => s.status ?? '-').join('')}`} roster={r} />}
          </div>
        )
      ) : monthly.error ? <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, monthly.error)} onRetry={() => void monthly.refetch()} /> : !m ? <Skeleton className="h-64" /> : m.staff.length === 0 ? (
        <EmptyState title={t('attendance.noStaff')} description={t('attendance.noStaffBody')} />
      ) : (
        <>
          <MonthlyGrid month={m.month} days={m.days} holidays={m.holidays} rows={m.staff.map((s) => ({ id: s.id, label: s.name, sub: s.employeeNo, records: s.records, totals: s.totals }))} />
          <p className="mt-3 text-xs text-muted">{t('attendance.legend')}</p>
        </>
      )}
    </div>
  );
}
