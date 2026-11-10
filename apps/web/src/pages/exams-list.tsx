import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { useCreateExam, useExams, type ExamDto } from '@/features/exams/exams-api';
import { ExamStatusBadgeTone, ExamsTabs } from '@/features/exams/exams-tabs';
import { PageHeader, fmtDate, platformError } from '@/features/platform/common';

function CreateExamModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateExam();
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const bad = Boolean(start && end && end < start);
  const submit = async () => {
    try {
      await create.mutateAsync({ name: name.trim(), startDate: start || null, endDate: end || null });
      toast.success(t('exams.created'));
      setName(''); setStart(''); setEnd('');
      onClose();
    } catch (e) {
      toast.error(t('platform.errors.generic'), platformError(t, e));
    }
  };
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={t('exams.addExam')} description={t('exams.addExamNote')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={create.isPending} disabled={name.trim().length < 2 || bad}>{t('exams.create')}</Button></>}>
      <div className="space-y-4">
        <Field id="ex-name" label={t('exams.name')} hint={t('exams.nameHint')}><Input id="ex-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="ex-start" label={t('exams.startDate')}><Input id="ex-start" type="date" dir="ltr" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field id="ex-end" label={t('exams.endDate')} error={bad ? t('attendance.rangeInvalid') : undefined}><Input id="ex-end" type="date" dir="ltr" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

export default function ExamsListPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const exams = useExams();
  const [open, setOpen] = useState(false);
  const columns: Column<ExamDto>[] = [
    { key: 'name', header: t('exams.name'), sortValue: (e) => e.name, cell: (e) => <Link to={`/app/exams/${e.id}`} className="font-semibold text-brand-700 hover:underline">{e.name}</Link> },
    { key: 'dates', header: t('exams.dates'), sortValue: (e) => e.startDate ?? '', cell: (e) => (e.startDate ? `${fmtDate(e.startDate, i18n.language)}${e.endDate ? ` – ${fmtDate(e.endDate, i18n.language)}` : ''}` : '—') },
    { key: 'papers', header: t('exams.papers'), sortValue: (e) => e.paperCount, cell: (e) => e.paperCount },
    { key: 'status', header: t('exams.status'), sortValue: (e) => e.status, cell: (e) => <Badge tone={ExamStatusBadgeTone(e.status)}>{t(`exams.statuses.${e.status}`)}</Badge> },
  ];
  return (
    <div>
      <PageHeader title={t('exams.title')} subtitle={t('exams.subtitle')}
        action={can('exam.manage') ? <Button onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden />{t('exams.addExam')}</Button> : undefined} />
      <ExamsTabs />
      <DataTable columns={columns} rows={exams.data ?? []} rowKey={(e) => e.id} pageSize={15} searchText={(e) => e.name}
        loading={exams.isLoading} error={exams.error ? platformError(t, exams.error) : null} onRetry={() => void exams.refetch()}
        emptyTitle={t('exams.emptyTitle')} emptyDescription={t('exams.emptyBody')} />
      <CreateExamModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
