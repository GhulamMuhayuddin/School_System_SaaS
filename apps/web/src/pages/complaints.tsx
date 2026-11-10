import { ArrowLeft, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input, Select } from '@/components/ui/input';
import { ErrorState, Spinner } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { ComplaintFormModal, StatusModal } from '@/features/operations/ops-modals';
import {
  CATEGORIES, COMPLAINT_STATUSES, PRIORITIES, ageDays, nextStatuses, priorityTone, statusTone, useAddNote, useAssignComplaint, useComplaint, useComplaintSummary, useComplaints, useUpdateComplaint,
  type Complaint, type ComplaintCategory, type ComplaintPriority, type ComplaintStatus,
} from '@/features/operations/ops-api';
import { PageHeader, fmtDate, platformError } from '@/features/platform/common';
import { useStaffList } from '@/features/staff/staff-api';
import { cn } from '@/lib/cn';

function Detail({ id, onBack }: { id: string; onBack: () => void }) {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const one = useComplaint(id);
  const staff = useStaffList({ status: 'ACTIVE' });
  const assign = useAssignComplaint();
  const update = useUpdateComplaint();
  const addNote = useAddNote();
  const [moving, setMoving] = useState<ComplaintStatus | null>(null);
  const [note, setNote] = useState('');
  const manage = can('complaint.manage');
  if (one.isLoading) return <Spinner />;
  if (one.error || !one.data) return <ErrorState title={t('platform.errors.generic')} description={one.error ? platformError(t, one.error) : undefined} onRetry={() => void one.refetch()} />;
  const { complaint: c, notes } = one.data;
  const fail = (e: unknown) => toast.error(t('platform.errors.generic'), platformError(t, e));
  const submitNote = () => void addNote.mutateAsync({ id, text: note.trim() }).then(() => setNote(''), fail);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{t('complaints.back')}</Button>
        <h2 className="text-lg font-bold text-navy-900">{c.subject}</h2>
        <Badge tone={statusTone(c.status)}>{t(`complaints.statuses.${c.status}`)}</Badge>
        <Badge tone={priorityTone(c.priority)}>{t(`complaints.priorities.${c.priority}`)}</Badge>
      </div>
      <Card className="space-y-2 p-4 text-sm">
        <p className="text-xs text-muted"><span dir="ltr">{c.complaintNo}</span> · {t(`complaints.categories.${c.category}`)} · {t('complaints.fromWho', { name: c.name, source: t(`complaints.sources.${c.source}`) })}{c.phone ? <> · <span dir="ltr">{c.phone}</span></> : null} · {fmtDate(c.createdAt.slice(0, 10), i18n.language)}</p>
        <p className="whitespace-pre-wrap">{c.details}</p>
        {c.resolution ? <p className="rounded-card bg-emerald-50 p-3 text-emerald-900"><b>{t('complaints.resolution')}:</b> {c.resolution}</p> : null}
      </Card>
      {manage ? (
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-52">
            <Field id="cp-assign" label={t('complaints.assignedTo')}>
              <Select id="cp-assign" value={c.assignedTo?.id ?? ''} disabled={assign.isPending}
                onChange={(e) => void assign.mutateAsync({ id, staffId: e.target.value || null }).catch(fail)}>
                <option value="">{t('complaints.unassigned')}</option>
                {(staff.data?.staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
              </Select>
            </Field>
          </div>
          <div className="min-w-40">
            <Field id="cp-prio-edit" label={t('complaints.priority')}>
              <Select id="cp-prio-edit" value={c.priority} disabled={update.isPending} onChange={(e) => void update.mutateAsync({ id, patch: { priority: e.target.value as ComplaintPriority } }).catch(fail)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{t(`complaints.priorities.${p}`)}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-2 pb-1">
            {nextStatuses(c.status).map((s) => <Button key={s} size="sm" variant={s === 'RESOLVED' ? 'primary' : 'secondary'} onClick={() => setMoving(s)}>{t(`complaints.moveButton.${s}`)}</Button>)}
          </div>
        </div>
      ) : c.assignedTo ? <p className="text-sm text-muted">{t('complaints.assignedTo')}: {c.assignedTo.name}</p> : null}
      <section aria-label={t('complaints.timeline')}>
        <h3 className="mb-2 text-sm font-bold text-navy-900">{t('complaints.timeline')}</h3>
        {notes.length === 0 ? <p className="text-sm text-muted">{t('complaints.noNotes')}</p> : (
          <ol className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className={cn('rounded-card p-3 text-sm ring-1 ring-line', n.kind === 'NOTE' ? 'bg-white' : 'bg-canvas text-muted')}>
                <p className="whitespace-pre-wrap">{n.text}</p>
                <p className="mt-1 text-xs text-muted">{n.by ?? t('complaints.system')} · {fmtDate(n.createdAt.slice(0, 10), i18n.language)}</p>
              </li>
            ))}
          </ol>
        )}
        {manage ? (
          <div className="mt-3 flex gap-2">
            <div className="flex-1"><label htmlFor="cp-note" className="sr-only">{t('complaints.addNote')}</label><Input id="cp-note" value={note} maxLength={1000} placeholder={t('complaints.addNote')} onChange={(e) => setNote(e.target.value)} /></div>
            <Button onClick={submitNote} disabled={note.trim() === ''} loading={addNote.isPending}>{t('complaints.addNoteButton')}</Button>
          </div>
        ) : null}
      </section>
      {moving ? <StatusModal key={moving} complaint={c} status={moving} onClose={() => setMoving(null)} /> : null}
    </div>
  );
}

export default function ComplaintsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState<ComplaintStatus | ''>('');
  const [category, setCategory] = useState<ComplaintCategory | ''>('');
  const [priority, setPriority] = useState<ComplaintPriority | ''>('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [q, setQ] = useState('');
  const summary = useComplaintSummary().data;
  const list = useComplaints({ status: status || undefined, category: category || undefined, priority: priority || undefined, active: activeOnly && !status, q: q.trim() || undefined });
  const chip = (label: string, value: number, warn = false) => <Card key={label} className="p-4"><p className="text-xs text-muted">{label}</p><p className={cn('text-xl font-extrabold', warn ? 'text-rose-700' : 'text-navy-900')} dir="ltr">{value}</p></Card>;
  const columns: Column<Complaint>[] = [
    { key: 'subject', header: t('complaints.subject'), sortValue: (c) => c.subject, cell: (c) => <span><button type="button" className="text-start font-semibold text-brand-700 hover:underline" onClick={() => setOpen(c.id)}>{c.subject}</button><span className="block text-xs text-muted"><span dir="ltr">{c.complaintNo}</span> · {c.name}</span></span> },
    { key: 'category', header: t('complaints.category'), sortValue: (c) => c.category, cell: (c) => t(`complaints.categories.${c.category}`) },
    { key: 'priority', header: t('complaints.priority'), sortValue: (c) => PRIORITIES.indexOf(c.priority), cell: (c) => <Badge tone={priorityTone(c.priority)}>{t(`complaints.priorities.${c.priority}`)}</Badge> },
    { key: 'status', header: t('complaints.status'), sortValue: (c) => c.status, cell: (c) => <Badge tone={statusTone(c.status)}>{t(`complaints.statuses.${c.status}`)}</Badge> },
    { key: 'who', header: t('complaints.assignedTo'), sortValue: (c) => c.assignedTo?.name ?? '', cell: (c) => c.assignedTo?.name ?? '—' },
    { key: 'age', header: t('complaints.age'), sortValue: (c) => ageDays(c.createdAt), cell: (c) => <span dir="ltr">{t('complaints.days', { count: ageDays(c.createdAt) })}</span> },
  ];
  if (open) return <div className="space-y-5"><PageHeader title={t('complaints.title')} subtitle={t('complaints.subtitle')} /><Detail id={open} onBack={() => setOpen(null)} /></div>;
  return (
    <div className="space-y-5">
      <PageHeader title={t('complaints.title')} subtitle={t('complaints.subtitle')} />
      {summary ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{chip(t('complaints.openCount'), summary.open)}{chip(t('complaints.inProgressCount'), summary.inProgress)}{chip(t('complaints.highActive'), summary.highActive, summary.highActive > 0)}{chip(t('complaints.resolvedCount'), summary.resolved)}</div> : null}
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-44"><label htmlFor="cf-q" className="mb-1 block text-sm font-medium text-navy-900">{t('complaints.search')}</label><Input id="cf-q" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="min-w-40"><Field id="cf-status" label={t('complaints.status')}><Select id="cf-status" value={status} onChange={(e) => setStatus(e.target.value as ComplaintStatus | '')}><option value="">{t('complaints.all')}</option>{COMPLAINT_STATUSES.map((s) => <option key={s} value={s}>{t(`complaints.statuses.${s}`)}</option>)}</Select></Field></div>
        <div className="min-w-40"><Field id="cf-cat" label={t('complaints.category')}><Select id="cf-cat" value={category} onChange={(e) => setCategory(e.target.value as ComplaintCategory | '')}><option value="">{t('complaints.all')}</option>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`complaints.categories.${c}`)}</option>)}</Select></Field></div>
        <div className="min-w-36"><Field id="cf-prio" label={t('complaints.priority')}><Select id="cf-prio" value={priority} onChange={(e) => setPriority(e.target.value as ComplaintPriority | '')}><option value="">{t('complaints.all')}</option>{PRIORITIES.map((p) => <option key={p} value={p}>{t(`complaints.priorities.${p}`)}</option>)}</Select></Field></div>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={activeOnly} disabled={status !== ''} onChange={(e) => setActiveOnly(e.target.checked)} />{t('complaints.activeOnly')}</label>
        {can('complaint.manage') ? <Button onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden />{t('complaints.logTitle')}</Button> : null}
      </div>
      <DataTable columns={columns} rows={list.data?.complaints ?? []} rowKey={(c) => c.id} pageSize={15} searchText={(c) => `${c.subject} ${c.name} ${c.complaintNo}`}
        loading={list.isLoading} error={list.error ? platformError(t, list.error) : null} onRetry={() => void list.refetch()}
        emptyTitle={t('complaints.emptyTitle')} emptyDescription={t('complaints.emptyBody')} />
      {list.data?.truncated ? <p className="text-xs text-muted">{t('complaints.truncated')}</p> : null}
      {adding ? <ComplaintFormModal onClose={() => setAdding(false)} onCreated={(id) => setOpen(id)} /> : null}
    </div>
  );
}
