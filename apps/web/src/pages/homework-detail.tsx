import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/modal';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { stateTone, useDeleteHomework, useHomework } from '@/features/homework/homework-api';
import { HomeworkFormModal } from '@/features/homework/homework-modals';
import { RosterEditor } from '@/features/homework/homework-roster';
import { PageHeader, fmtDate, platformError } from '@/features/platform/common';

export default function HomeworkDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, isLoading, error, refetch } = useHomework(id);
  const del = useDeleteHomework();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (error) return <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, error)} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <Skeleton className="h-64" />;
  const editable = can('homework.manage') && data.access.canEdit;
  const signature = data.roster.map((r) => `${r.studentId}:${r.status}:${r.marks}:${r.remark}`).join('|');
  const remove = async () => {
    try { await del.mutateAsync(data.id); toast.success(t('homework.deleted')); navigate('/app/homework'); }
    catch (err) { toast.error(t('platform.errors.generic'), platformError(t, err)); }
  };
  return (
    <div>
      <Link to="/app/homework" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{t('homework.back')}</Link>
      <PageHeader title={data.title} subtitle={`${data.class.name} – ${data.section.name} · ${data.subject.name}`}
        action={editable ? <div className="flex gap-2"><Button variant="secondary" onClick={() => setEditing(true)}>{t('homework.edit')}</Button><Button variant="danger" onClick={() => setDeleting(true)}>{t('homework.delete')}</Button></div> : undefined} />
      <Card className="mb-6 p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-muted">{t('homework.assignedDate')}</dt><dd className="font-semibold">{fmtDate(data.assignedDate, i18n.language)}</dd></div>
          <div><dt className="text-muted">{t('homework.dueDate')}</dt><dd className="font-semibold">{fmtDate(data.dueDate, i18n.language)} <Badge tone={stateTone(data.state)} className="ms-1">{t(`homework.state.${data.state}`)}</Badge></dd></div>
          <div><dt className="text-muted">{t('homework.maxMarks')}</dt><dd className="font-semibold" dir="ltr">{data.maxMarks ?? '—'}</dd></div>
          <div><dt className="text-muted">{t('homework.checked')}</dt><dd className="font-semibold" dir="ltr">{data.counts.students - data.counts.pending} / {data.counts.students}</dd></div>
        </dl>
        {data.description ? <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{data.description}</p> : null}
      </Card>
      {can('homework.manage') && !data.access.canEdit ? <p className="mb-3 text-sm text-amber-700">{t('homework.notYours')}</p> : null}
      <h2 className="mb-3 font-semibold text-navy-900">{t('homework.checklist')}</h2>
      <RosterEditor key={`${data.id}|${signature}|${data.maxMarks}`} detail={data} editable={editable} />
      {editing ? <HomeworkFormModal open existing={data} onClose={() => setEditing(false)} /> : null}
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title={t('homework.deleteTitle')} description={t('homework.deleteNote')} confirmLabel={t('homework.delete')} danger loading={del.isPending} onConfirm={() => void remove()} />
    </div>
  );
}
