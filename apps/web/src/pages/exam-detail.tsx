import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useClassSubjects } from '@/features/academics/academics-api';
import { useAuth } from '@/features/auth/auth-context';
import { useDeleteExam, useExam, usePublish, useSetPapers, useUnpublish, type ExamDetail, type PaperDto } from '@/features/exams/exams-api';
import { ExamStatusBadgeTone } from '@/features/exams/exams-tabs';
import { PageHeader, fmtDate, platformError } from '@/features/platform/common';
import { useClasses } from '@/features/students/students-api';
import { ApiError } from '@/lib/api';

type Row = { on: boolean; total: string; pass: string };

/** Which subjects of a class are examined, with total and pass marks. Remounted per class so the draft never leaks. */
function PapersModal({ exam, classId, className, onClose }: { exam: ExamDetail; classId: string; className: string; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const subjects = useClassSubjects(classId);
  const set = useSetPapers(exam.id);
  const existing = exam.papers.filter((p) => p.classId === classId);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const rowOf = (id: string): Row => {
    if (rows[id]) return rows[id];
    const p = existing.find((x) => x.subjectId === id);
    return p ? { on: true, total: String(p.totalMarks), pass: String(p.passMarks) } : { on: false, total: '100', pass: '33' };
  };
  const patch = (id: string, v: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...rowOf(id), ...v } }));
  const list = subjects.data?.subjects ?? [];
  const chosen = list.filter((s) => rowOf(s.id).on);
  const invalid = chosen.some((s) => { const r = rowOf(s.id); const tt = Number(r.total); const pp = Number(r.pass); return !(tt > 0) || !(pp >= 0) || pp > tt || Number.isNaN(pp); });
  const save = async () => {
    try {
      await set.mutateAsync({ classId, papers: chosen.map((s) => ({ subjectId: s.id, totalMarks: Number(rowOf(s.id).total), passMarks: Number(rowOf(s.id).pass) })) });
      toast.success(t('exams.papersSaved'));
      onClose();
    } catch (e) {
      toast.error(t('platform.errors.generic'), platformError(t, e));
    }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('exams.setupPapers', { class: className })} description={t('exams.setupPapersNote')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void save()} loading={set.isPending} disabled={invalid || subjects.isLoading}>{t('exams.savePapers')}</Button></>}>
      {subjects.isLoading ? <Skeleton className="h-24" /> : list.length === 0 ? <p className="text-sm text-muted">{t('exams.noClassSubjects')}</p> : (
        <ul className="space-y-3">
          {list.map((s) => {
            const r = rowOf(s.id);
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3">
                <label className="flex min-w-32 flex-1 items-center gap-2 text-sm font-semibold text-navy-900">
                  <input type="checkbox" checked={r.on} onChange={(e) => patch(s.id, { on: e.target.checked })} />{s.name}
                </label>
                <Input aria-label={`${s.name}: ${t('exams.totalMarks')}`} className="w-24" type="number" inputMode="decimal" dir="ltr" min={1} value={r.total} disabled={!r.on} onChange={(e) => patch(s.id, { total: e.target.value })} />
                <Input aria-label={`${s.name}: ${t('exams.passMarks')}`} className="w-24" type="number" inputMode="decimal" dir="ltr" min={0} value={r.pass} disabled={!r.on} onChange={(e) => patch(s.id, { pass: e.target.value })} />
              </li>
            );
          })}
          <li className="flex gap-3 pt-1 text-xs text-muted"><span className="flex-1" /><span className="w-24">{t('exams.totalMarks')}</span><span className="w-24">{t('exams.passMarks')}</span></li>
        </ul>
      )}
    </Modal>
  );
}

function PaperRow({ p }: { p: PaperDto }) {
  const { t } = useTranslation();
  const done = p.students > 0 && p.entered >= p.students;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-navy-900">{p.subjectName}</p>
        <p className="text-xs text-muted">{t('exams.outOf', { total: p.totalMarks, pass: p.passMarks })}</p>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone={done ? 'success' : p.entered > 0 ? 'warning' : 'neutral'}>{t('exams.progress', { entered: p.entered, students: p.students })}</Badge>
        <Link to={`/app/exams/papers/${p.id}`} className="text-sm font-semibold text-brand-700 hover:underline">{t('exams.enterMarks')}</Link>
      </div>
    </li>
  );
}

export default function ExamDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const exam = useExam(id);
  const classes = useClasses();
  const publish = usePublish(id ?? '');
  const unpublish = useUnpublish(id ?? '');
  const remove = useDeleteExam();
  const [setup, setSetup] = useState<{ id: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<null | { missing: number }>(null);

  if (exam.error) return <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, exam.error)} onRetry={() => void exam.refetch()} />;
  const e = exam.data;
  if (!e) return <Skeleton className="h-64" />;
  const published = e.status === 'PUBLISHED';
  const fail = (err: unknown) => toast.error(t('platform.errors.generic'), platformError(t, err));
  const doPublish = async (force: boolean) => {
    try {
      await publish.mutateAsync(force);
      setConfirm(null);
      toast.success(t('exams.publishedToast'));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'MARKS_INCOMPLETE') setConfirm({ missing: (err.details as { missing?: number } | undefined)?.missing ?? 0 });
      else fail(err);
    }
  };
  const byClass = new Map<string, PaperDto[]>();
  for (const p of e.papers) byClass.set(p.classId, [...(byClass.get(p.classId) ?? []), p]);
  const classRefs = (classes.data ?? []).filter((c) => !byClass.has(c.id));

  return (
    <div className="space-y-5">
      <PageHeader title={e.name} subtitle={`${e.sessionName}${e.startDate ? ` · ${fmtDate(e.startDate, i18n.language)}${e.endDate ? ` – ${fmtDate(e.endDate, i18n.language)}` : ''}` : ''}`}
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ExamStatusBadgeTone(e.status)}>{t(`exams.statuses.${e.status}`)}</Badge>
            {can('exam.result.publish') && (published
              ? <Button variant="secondary" onClick={() => unpublish.mutateAsync().then(() => toast.success(t('exams.unpublishedToast'))).catch(fail)} loading={unpublish.isPending}>{t('exams.unpublish')}</Button>
              : <Button onClick={() => void doPublish(false)} loading={publish.isPending} disabled={e.paperCount === 0}>{t('exams.publish')}</Button>)}
            {can('exam.manage') && !published && (
              <Button variant="ghost" aria-label={t('exams.deleteExam')} onClick={() => { if (window.confirm(t('exams.deleteConfirm', { name: e.name }))) remove.mutateAsync(e.id).then(() => nav('/app/exams')).catch(fail); }}><Trash2 className="size-4 text-rose-600" aria-hidden /></Button>
            )}
          </div>
        )} />
      {published && <p role="status" className="rounded-control bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{t('exams.publishedNote')}</p>}

      {e.papers.length === 0 && (
        <EmptyState title={t('exams.noPapers')} description={can('exam.manage') ? t('exams.noPapersBody') : t('exams.noPapersViewer')} />
      )}

      {[...byClass.entries()].map(([classId, papers]) => (
        <Card key={classId} className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
            <CardHeader title={papers[0].className} description={t('exams.classPapers', { count: papers.length })} />
            <div className="flex items-center gap-3">
              <Link to={`/app/exams/${e.id}/results?classId=${classId}`} className="text-sm font-semibold text-brand-700 hover:underline">{t('exams.viewResults')}</Link>
              {can('exam.manage') && !published && <Button size="sm" variant="secondary" onClick={() => setSetup({ id: classId, name: papers[0].className })}><Pencil className="size-3.5" aria-hidden />{t('exams.editPapers')}</Button>}
            </div>
          </div>
          <ul className="divide-y divide-line/70">{papers.map((p) => <PaperRow key={p.id} p={p} />)}</ul>
        </Card>
      ))}

      {can('exam.manage') && !published && classRefs.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold text-navy-900">{t('exams.addClass')}</p>
          <div className="flex flex-wrap items-end gap-3">
            <Field id="ex-add-class" label={t('students.class')}>
              <Select id="ex-add-class" defaultValue="" onChange={(ev) => { const c = classRefs.find((x) => x.id === ev.target.value); if (c) setSetup({ id: c.id, name: c.name }); ev.target.value = ''; }}>
                <option value="">{t('exams.chooseClass')}</option>
                {classRefs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
        </Card>
      )}

      {setup && <PapersModal key={setup.id} exam={e} classId={setup.id} className={setup.name} onClose={() => setSetup(null)} />}
      <Modal open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)} title={t('exams.missingTitle')} description={t('exams.missingBody', { count: confirm?.missing ?? 0 })}
        footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>{t('exams.goBack')}</Button><Button onClick={() => void doPublish(true)} loading={publish.isPending}>{t('exams.publishAnyway')}</Button></>} />
    </div>
  );
}
