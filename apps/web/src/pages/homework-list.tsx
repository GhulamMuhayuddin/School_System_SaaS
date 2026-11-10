import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input, Select } from '@/components/ui/input';
import { useAuth } from '@/features/auth/auth-context';
import { HomeworkFormModal } from '@/features/homework/homework-modals';
import { stateTone, useHomeworkList, type HomeworkItem } from '@/features/homework/homework-api';
import { PageHeader, fmtDate, platformError } from '@/features/platform/common';
import { useClasses } from '@/features/students/students-api';

export default function HomeworkListPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const classes = useClasses();
  const [classId, setClassId] = useState('');
  const [mine, setMine] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [adding, setAdding] = useState(false);
  const bad = Boolean(from && to && to < from);
  const list = useHomeworkList({ classId, mine, from: bad ? '' : from, to: bad ? '' : to });
  const columns: Column<HomeworkItem>[] = [
    { key: 'title', header: t('homework.titleLabel'), sortValue: (h) => h.title, cell: (h) => <Link className="font-semibold text-brand-700 hover:underline" to={`/app/homework/${h.id}`}>{h.title}</Link> },
    { key: 'class', header: t('homework.class'), sortValue: (h) => `${h.class.name} ${h.section.name}`, cell: (h) => `${h.class.name} – ${h.section.name}` },
    { key: 'subject', header: t('homework.subject'), sortValue: (h) => h.subject.name, cell: (h) => h.subject.name },
    { key: 'due', header: t('homework.dueDate'), sortValue: (h) => h.dueDate, cell: (h) => fmtDate(h.dueDate, i18n.language) },
    { key: 'state', header: t('homework.stateLabel'), sortValue: (h) => h.state, cell: (h) => <Badge tone={stateTone(h.state)}>{t(`homework.state.${h.state}`)}</Badge> },
    { key: 'checked', header: t('homework.checked'), sortValue: (h) => h.counts.students - h.counts.pending, cell: (h) => <span dir="ltr">{h.counts.students - h.counts.pending} / {h.counts.students}</span> },
    { key: 'missing', header: t('homework.status.MISSING'), sortValue: (h) => h.counts.missing, cell: (h) => <span dir="ltr">{h.counts.missing}</span> },
  ];
  return (
    <div>
      <PageHeader title={t('homework.title')} subtitle={t('homework.subtitle')}
        action={can('homework.manage') ? <Button onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden />{t('homework.add')}</Button> : undefined} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="hl-class" label={t('homework.class')}>
          <Select id="hl-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{t('homework.allClasses')}</option>{(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field id="hl-from" label={t('homework.dueFrom')}><Input id="hl-from" type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field id="hl-to" label={t('homework.dueTo')} error={bad ? t('attendance.rangeInvalid') : undefined}><Input id="hl-to" type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        {can('homework.manage') ? <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />{t('homework.mine')}</label> : null}
      </div>
      <DataTable columns={columns} rows={list.data ?? []} rowKey={(h) => h.id} pageSize={15} searchText={(h) => `${h.title} ${h.subject.name} ${h.class.name} ${h.section.name}`}
        loading={list.isLoading} error={list.error ? platformError(t, list.error) : null} onRetry={() => void list.refetch()} emptyTitle={t('homework.emptyTitle')} emptyDescription={t('homework.emptyBody')} />
      {adding ? <HomeworkFormModal open onClose={() => setAdding(false)} onCreated={(id) => navigate(`/app/homework/${id}`)} /> : null}
    </div>
  );
}
