import { LogIn, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { todayText } from '@/features/hr/hr-api';
import { VisitFormModal } from '@/features/operations/ops-modals';
import { durationText, timeOf, useCheckOut, useVisitSummary, useVisits, type Visit } from '@/features/operations/ops-api';
import { PageHeader, fmtDate, platformError } from '@/features/platform/common';

export default function VisitorsPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const [date, setDate] = useState(todayText());
  const [insideOnly, setInsideOnly] = useState(false);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Visit | 'new' | null>(null);
  const summary = useVisitSummary().data;
  const visits = useVisits({ date: date || undefined, inside: insideOnly, q: q.trim() || undefined });
  const checkOut = useCheckOut();
  const manage = can('visitor.manage');
  const out = (v: Visit) => void checkOut.mutateAsync(v.id).then(() => toast.success(t('visitors.checkedOut')), (e) => toast.error(t('platform.errors.generic'), platformError(t, e)));
  const columns: Column<Visit>[] = [
    { key: 'name', header: t('visitors.visitor'), sortValue: (v) => v.name, cell: (v) => <span>{manage ? <button type="button" className="text-start font-semibold text-brand-700 hover:underline" onClick={() => setEditing(v)}>{v.name}</button> : <b>{v.name}</b>}<span className="block text-xs text-muted"><span dir="ltr">{v.visitNo}</span>{v.phone ? <> · <span dir="ltr">{v.phone}</span></> : null}</span></span> },
    { key: 'purpose', header: t('visitors.purpose'), sortValue: (v) => v.purpose, cell: (v) => <span>{v.purpose}{v.visiting ? <span className="block text-xs text-muted">{t('visitors.toSee', { who: v.visiting })}</span> : null}{v.notes ? <span className="block text-xs text-muted">{v.notes}</span> : null}</span> },
    { key: 'in', header: t('visitors.in'), sortValue: (v) => v.checkInAt, cell: (v) => <span dir="ltr">{insideOnly ? `${fmtDate(v.checkInAt.slice(0, 10), i18n.language)} ` : ''}{timeOf(v.checkInAt, i18n.language)}</span> },
    { key: 'out', header: t('visitors.out'), sortValue: (v) => v.checkOutAt ?? '9', cell: (v) => (v.inside ? <Badge tone="warning">{t('visitors.inside')}</Badge> : <span dir="ltr">{timeOf(v.checkOutAt!, i18n.language)} <span className="text-xs text-muted">({durationText(v.minutes)})</span></span>) },
    ...(manage ? [{ key: 'x', header: '', sortValue: () => '', cell: (v: Visit) => (v.inside ? <Button size="sm" variant="secondary" onClick={() => out(v)} loading={checkOut.isPending && checkOut.variables === v.id}><LogIn className="size-4 rtl:rotate-180" aria-hidden />{t('visitors.checkOut')}</Button> : null) }] : []),
  ];
  return (
    <div className="space-y-5">
      <PageHeader title={t('visitors.title')} subtitle={t('visitors.subtitle')} />
      {summary ? <div className="grid grid-cols-2 gap-3">
        <Card className="p-4"><p className="text-xs text-muted">{t('visitors.today')}</p><p className="text-xl font-extrabold text-navy-900" dir="ltr">{summary.today}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">{t('visitors.insideNow')}</p><p className="text-xl font-extrabold text-navy-900" dir="ltr">{summary.inside}</p></Card>
      </div> : null}
      <div className="flex flex-wrap items-end gap-4">
        <Field id="vs-date" label={t('visitors.date')}><Input id="vs-date" type="date" dir="ltr" value={date} max={todayText()} disabled={insideOnly} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="min-w-48"><label htmlFor="vs-q" className="mb-1 block text-sm font-medium text-navy-900">{t('visitors.search')}</label><Input id="vs-q" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={insideOnly} onChange={(e) => setInsideOnly(e.target.checked)} />{t('visitors.onlyInside')}</label>
        {manage ? <Button onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden />{t('visitors.checkInTitle')}</Button> : null}
      </div>
      <DataTable columns={columns} rows={visits.data?.visits ?? []} rowKey={(v) => v.id} pageSize={20} searchText={(v) => `${v.name} ${v.visitNo} ${v.purpose}`}
        loading={visits.isLoading} error={visits.error ? platformError(t, visits.error) : null} onRetry={() => void visits.refetch()}
        emptyTitle={t('visitors.emptyTitle')} emptyDescription={t('visitors.emptyBody')} />
      {visits.data?.truncated ? <p className="text-xs text-muted">{t('visitors.truncated')}</p> : null}
      {editing ? <VisitFormModal key={editing === 'new' ? 'new' : editing.id} visit={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
