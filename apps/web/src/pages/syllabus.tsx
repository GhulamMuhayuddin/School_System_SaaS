import { useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useClassSubjects } from '@/features/academics/academics-api';
import { useClassSection } from '@/features/academics/class-section-picker';
import { TOPIC_STATUSES, useSyllabus, useSyllabusSummary, useTopicActions, type Progress, type TopicDto, type TopicStatus } from '@/features/academics/planning-api';
import { useAuth } from '@/features/auth/auth-context';
import { PageHeader, fmtDate, platformError } from '@/features/platform/common';
import { useClasses } from '@/features/students/students-api';
import { cn } from '@/lib/cn';

const statusTone = { PLANNED: 'neutral', IN_PROGRESS: 'warning', COMPLETED: 'success' } as const;

function ProgressBar({ progress, label }: { progress: Progress; label: string }) {
  const pct = progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100);
  return (
    <div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TopicModal({ classId, subjectId, topic, onClose }: { classId: string; subjectId: string; topic?: TopicDto; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const a = useTopicActions();
  const [title, setTitle] = useState(topic?.title ?? '');
  const [notes, setNotes] = useState(topic?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    try {
      if (topic) await a.update.mutateAsync({ id: topic.id, title: title.trim(), description: notes.trim() || null });
      else await a.create.mutateAsync({ classId, subjectId, title: title.trim(), description: notes.trim() || null });
      toast.success(t('syllabus.saved'));
      onClose();
    } catch (e) {
      setError(platformError(t, e));
    }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={topic ? t('syllabus.edit') : t('syllabus.addTopic')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void save()} disabled={!title.trim()} loading={a.create.isPending || a.update.isPending}>{t('syllabus.save')}</Button></>}>
      <div className="space-y-4">
        {error && <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
        <Field id="tp-title" label={t('syllabus.topicTitle')}><Input id="tp-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} /></Field>
        <Field id="tp-notes" label={t('syllabus.topicNotes')}><Textarea id="tp-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></Field>
      </div>
    </Modal>
  );
}

export default function SyllabusPage() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { can } = useAuth();
  const manage = can('academic.manage');
  const classes = useClasses();
  const { cls, setClassId } = useClassSection(classes.data);
  const subjects = useClassSubjects(cls?.id);
  const summary = useSyllabusSummary(cls?.id);
  const [subjectChoice, setSubjectChoice] = useState('');
  const subjectList = subjects.data?.subjects ?? [];
  const subject = subjectList.find((s) => s.id === subjectChoice) ?? subjectList[0];
  const syllabus = useSyllabus(cls?.id, subject?.id);
  const actions = useTopicActions();
  const [dialog, setDialog] = useState<{ topic?: TopicDto } | null>(null);
  const [confirm, setConfirm] = useState<TopicDto | null>(null);
  const fail = (e: unknown) => toast.error(t('platform.errors.generic'), platformError(t, e));

  const pickClass = (id: string) => { setClassId(id); setSubjectChoice(''); };

  const content = () => {
    if (!subject) return <EmptyState title={t('syllabus.noSubjects')} />;
    if (syllabus.error) return <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, syllabus.error)} onRetry={() => void syllabus.refetch()} />;
    if (syllabus.isLoading || !syllabus.data) return <Skeleton className="h-40" />;
    const { topics, progress } = syllabus.data;
    return (
      <>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-48 flex-1">
            <p className="mb-1 text-sm font-semibold text-navy-900">{subject.name} · {t('syllabus.progress', { completed: progress.completed, total: progress.total })}</p>
            <ProgressBar progress={progress} label={t('syllabus.progress', { completed: progress.completed, total: progress.total })} />
          </div>
          {manage && <Button onClick={() => setDialog({})}><Plus className="size-4" aria-hidden />{t('syllabus.addTopic')}</Button>}
        </div>
        {topics.length === 0 ? <EmptyState title={t('syllabus.empty')} description={t('syllabus.emptyBody')} /> : (
          <Card>
            <ol className="divide-y divide-line">
              {topics.map((topic, index) => (
                <li key={topic.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-canvas text-xs font-bold text-muted">{index + 1}</span>
                    <div className="min-w-0">
                      <p className="font-bold text-navy-900">{topic.title}</p>
                      {topic.description && <p className="text-sm text-muted">{topic.description}</p>}
                      {topic.completedAt && <p className="text-xs text-emerald-700">{t('syllabus.completedOn', { date: fmtDate(topic.completedAt, i18n.language) })}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {manage ? (
                      <>
                        <Select aria-label={`${t('syllabus.statusLabel')}: ${topic.title}`} className="w-40" value={topic.status}
                          onChange={(e) => actions.setStatus.mutateAsync({ id: topic.id, status: e.target.value as TopicStatus }).catch(fail)}>
                          {TOPIC_STATUSES.map((s) => <option key={s} value={s}>{t(`syllabus.status.${s}`)}</option>)}
                        </Select>
                        <Button size="sm" variant="ghost" aria-label={`${t('syllabus.moveUp')}: ${topic.title}`} disabled={index === 0} onClick={() => actions.move.mutateAsync({ id: topic.id, direction: 'up' }).catch(fail)}><ArrowUp className="size-4" aria-hidden /></Button>
                        <Button size="sm" variant="ghost" aria-label={`${t('syllabus.moveDown')}: ${topic.title}`} disabled={index === topics.length - 1} onClick={() => actions.move.mutateAsync({ id: topic.id, direction: 'down' }).catch(fail)}><ArrowDown className="size-4" aria-hidden /></Button>
                        <Button size="sm" variant="ghost" aria-label={`${t('syllabus.edit')}: ${topic.title}`} onClick={() => setDialog({ topic })}><Pencil className="size-4" aria-hidden /></Button>
                        <Button size="sm" variant="ghost" aria-label={`${t('syllabus.delete')}: ${topic.title}`} onClick={() => setConfirm(topic)}><Trash2 className="size-4 text-rose-600" aria-hidden /></Button>
                      </>
                    ) : (
                      <Badge tone={statusTone[topic.status]}>{t(`syllabus.status.${topic.status}`)}</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </>
    );
  };

  if (classes.error) return <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, classes.error)} onRetry={() => void classes.refetch()} />;
  if (classes.isLoading || !classes.data) return <div><PageHeader title={t('syllabus.title')} /><Skeleton className="h-48" /></div>;
  if (classes.data.length === 0) return <div><PageHeader title={t('syllabus.title')} /><EmptyState title={t('syllabus.noClasses')} /></div>;

  return (
    <div>
      <PageHeader title={t('syllabus.title')} subtitle={t('syllabus.subtitle')} />
      <div className="mb-5 lg:max-w-xs">
        <Field id="sy-class" label={t('syllabus.class')}>
          <Select id="sy-class" value={cls?.id ?? ''} onChange={(e) => pickClass(e.target.value)}>
            {classes.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </div>

      {subjectList.length > 0 && (
        <section aria-label={t('syllabus.overview')} className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {subjectList.map((s) => {
            const p = summary.data?.subjects.find((x) => x.subject.id === s.id)?.progress ?? { total: 0, completed: 0, inProgress: 0 };
            const active = s.id === subject?.id;
            return (
              <button key={s.id} type="button" aria-pressed={active} onClick={() => setSubjectChoice(s.id)}
                className={cn('rounded-card bg-white p-3 text-start ring-1 transition-colors', active ? 'ring-2 ring-brand-500' : 'ring-line hover:bg-canvas')}>
                <span className="flex items-center justify-between text-sm font-bold text-navy-900">{s.name}<span className="text-xs font-semibold text-muted">{t('syllabus.subjectProgress', { completed: p.completed, total: p.total })}</span></span>
                <span className="mt-2 block"><ProgressBar progress={p} label={`${s.name}: ${t('syllabus.progress', { completed: p.completed, total: p.total })}`} /></span>
              </button>
            );
          })}
        </section>
      )}

      {content()}

      {dialog && cls && subject && <TopicModal classId={cls.id} subjectId={subject.id} topic={dialog.topic} onClose={() => setDialog(null)} />}
      {confirm && (
        <ConfirmDialog open onOpenChange={(o) => !o && setConfirm(null)} title={t('syllabus.deleteTitle', { title: confirm.title })} description={t('syllabus.deleteBody')} confirmLabel={t('syllabus.delete')} danger
          loading={actions.remove.isPending} onConfirm={() => actions.remove.mutateAsync(confirm.id).then(() => { toast.success(t('syllabus.deleted')); setConfirm(null); }).catch((e) => { fail(e); setConfirm(null); })} />
      )}
    </div>
  );
}
