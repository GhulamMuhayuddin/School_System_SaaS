import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { markText, parseMark, usePaperMarks, useSaveMarks, type PaperMarks } from '@/features/exams/exams-api';
import { PageHeader, platformError } from '@/features/platform/common';

/** One text box per student: a number, "A" for absent, or empty for not yet entered. Remounted when the saved sheet changes. */
function MarksEditor({ sheet, canEnterPermission }: { sheet: PaperMarks; canEnterPermission: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const save = useSaveMarks(sheet.paper.id);
  const total = sheet.paper.totalMarks;
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(sheet.students.map((s) => [s.studentId, markText(s)])));
  const editable = canEnterPermission && sheet.access.canEnter;
  const parsed = sheet.students.map((s) => ({ s, p: parseMark(draft[s.studentId] ?? '', total) }));
  const hasError = parsed.some((x) => x.p.error);
  const dirty = sheet.students.some((s) => (draft[s.studentId] ?? '') !== markText(s));
  const filled = parsed.filter((x) => x.p.entry && (x.p.entry.absent || x.p.entry.marks !== null)).length;
  const submit = async () => {
    try {
      await save.mutateAsync(parsed.filter((x) => (draft[x.s.studentId] ?? '') !== markText(x.s)).map((x) => ({ studentId: x.s.studentId, marks: x.p.entry!.marks, absent: x.p.entry!.absent })));
      toast.success(t('exams.marksSaved'));
    } catch (e) {
      toast.error(t('platform.errors.generic'), platformError(t, e));
    }
  };
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 text-sm">
        <span className="font-semibold text-navy-900">{t('exams.outOf', { total, pass: sheet.paper.passMarks })}</span>
        <span className="text-muted">{t('exams.progress', { entered: filled, students: sheet.students.length })}</span>
      </div>
      <ul className="divide-y divide-line/70">
        {parsed.map(({ s, p }, i) => (
          <li key={s.studentId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-navy-900"><span className="me-2 text-xs font-semibold text-muted">{i + 1}.</span>{s.name}{s.sectionName ? <span className="ms-2 text-xs font-normal text-muted">({s.sectionName})</span> : null}</p>
              <p className="text-xs text-muted" dir="ltr">{s.admissionNo}</p>
            </div>
            <div className="flex items-center gap-2">
              <Input aria-label={`${s.name}: ${t('exams.marks')}`} aria-invalid={p.error ? true : undefined} className="w-24 text-center" dir="ltr" inputMode="decimal" disabled={!editable}
                value={draft[s.studentId] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [s.studentId]: e.target.value }))} />
              {p.error && <span role="alert" className="text-xs font-medium text-rose-600">{p.error === 'tooHigh' ? t('exams.tooHigh', { total }) : t('exams.invalidMark')}</span>}
            </div>
          </li>
        ))}
      </ul>
      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
          <p className="text-xs text-muted">{t('exams.marksHint')}</p>
          <Button onClick={() => void submit()} disabled={!dirty || hasError} loading={save.isPending}>{t('exams.saveMarks')}</Button>
        </div>
      )}
    </Card>
  );
}

export default function ExamMarksPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { can } = useAuth();
  const marks = usePaperMarks(id);
  if (marks.error) return <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, marks.error)} onRetry={() => void marks.refetch()} />;
  const m = marks.data;
  if (!m) return <Skeleton className="h-64" />;
  return (
    <div className="space-y-5">
      <PageHeader title={`${m.paper.subjectName} · ${m.paper.className}`} subtitle={m.exam.name}
        action={<Link to={`/app/exams/${m.exam.id}`} className="text-sm font-semibold text-brand-700 hover:underline">{t('exams.backToExam')}</Link>} />
      {!m.access.canEnter && m.access.reason && <p role="status" className="rounded-control bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700">{t(`exams.blocked.${m.access.reason}`)}</p>}
      <MarksEditor key={m.students.map((s) => `${s.studentId}:${s.marks ?? ''}:${s.absent ? 'a' : ''}`).join('|')} sheet={m} canEnterPermission={can('exam.marks.enter')} />
    </div>
  );
}
