import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { downloadCsv } from '@/lib/csv';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Select } from '@/components/ui/input';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useClassResults, useExam, type StudentResult } from '@/features/exams/exams-api';
import { PageHeader, platformError } from '@/features/platform/common';
import { useClasses } from '@/features/students/students-api';

export default function ExamResultsPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const exam = useExam(id);
  const classes = useClasses();
  const examClassIds = new Set((exam.data?.papers ?? []).map((p) => p.classId));
  const examClasses = (classes.data ?? []).filter((c) => examClassIds.has(c.id));
  const classId = params.get('classId') ?? examClasses[0]?.id ?? '';
  const sectionId = params.get('sectionId') ?? '';
  const cls = examClasses.find((c) => c.id === classId);
  const results = useClassResults(id, classId || undefined, sectionId || undefined);
  const r = results.data;

  const columns: Column<StudentResult>[] = [
    { key: 'pos', header: t('exams.position'), sortValue: (x) => x.position ?? 9999, cell: (x) => (x.position === null ? '—' : <span className="font-bold">{x.position}</span>) },
    { key: 'name', header: t('platform.admins.name'), sortValue: (x) => x.student.name, cell: (x) => <Link to={`/app/students/${x.student.id}`} className="font-semibold text-brand-700 hover:underline">{x.student.name}</Link> },
    { key: 'sec', header: t('students.section'), sortValue: (x) => x.student.sectionName ?? '', cell: (x) => x.student.sectionName ?? '—' },
    ...(r?.subjects ?? []).map((s): Column<StudentResult> => ({
      key: `s-${s.subjectId}`, header: `${s.subjectName} (${s.totalMarks})`,
      sortValue: (x) => x.subjects.find((y) => y.subjectId === s.subjectId)?.marks ?? -1,
      cell: (x) => {
        const sr = x.subjects.find((y) => y.subjectId === s.subjectId);
        if (!sr || !sr.entered) return <span className="text-muted">—</span>;
        return sr.absent ? <Badge tone="danger">{t('exams.absentShort')}</Badge> : <span className={sr.passed ? '' : 'font-bold text-rose-600'}>{sr.marks}</span>;
      },
    })),
    { key: 'total', header: t('exams.total'), sortValue: (x) => x.obtained, cell: (x) => `${x.obtained}/${x.total}` },
    { key: 'pct', header: '%', sortValue: (x) => x.percentage ?? -1, cell: (x) => (x.percentage === null ? '—' : `${x.percentage}%`) },
    { key: 'grade', header: t('exams.grade'), sortValue: (x) => x.grade ?? '', cell: (x) => x.grade ?? '—' },
    { key: 'result', header: t('exams.result'), sortValue: (x) => (x.passed === null ? 2 : x.passed ? 0 : 1),
      cell: (x) => (x.passed === null ? <Badge>{t('exams.incomplete')}</Badge> : <Badge tone={x.passed ? 'success' : 'danger'}>{t(x.passed ? 'exams.pass' : 'exams.fail')}</Badge>) },
  ];

  if (exam.error) return <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, exam.error)} onRetry={() => void exam.refetch()} />;
  if (!exam.data) return <Skeleton className="h-64" />;
  return (
    <div className="space-y-5">
      <PageHeader title={`${exam.data.name} · ${t('exams.results')}`} subtitle={exam.data.status === 'PUBLISHED' ? t('exams.statuses.PUBLISHED') : t('exams.draftResults')}
        action={(
          <div className="flex flex-wrap items-center gap-3">
            {exam.data.status === 'PUBLISHED' && classId ? <Link to={`/app/exams/${exam.data.id}/report-cards?${new URLSearchParams({ classId, ...(sectionId ? { sectionId } : {}) }).toString()}`} className="text-sm font-semibold text-brand-700 hover:underline">{t('print.actions.reportCards')}</Link> : null}
            <Button variant="secondary" disabled={!r?.students.length} onClick={() => r && downloadCsv(`results-${exam.data.name}-${cls?.name ?? ''}`, ['Position', 'Admission No', 'Student', 'Section', ...r.subjects.map((s) => `${s.subjectName} (${s.totalMarks})`), 'Obtained', 'Total', 'Percentage', 'Grade', 'Result'],
              r.students.map((x) => [x.position, x.student.admissionNo, x.student.name, x.student.sectionName, ...r.subjects.map((s) => { const y = x.subjects.find((z) => z.subjectId === s.subjectId); return !y || !y.entered ? '' : y.absent ? 'ABSENT' : y.marks; }), x.obtained, x.total, x.percentage, x.grade, x.passed === null ? 'INCOMPLETE' : x.passed ? 'PASS' : 'FAIL']))}>{t('print.actions.exportCsv')}</Button>
            <Link to={`/app/exams/${exam.data.id}`} className="text-sm font-semibold text-brand-700 hover:underline">{t('exams.backToExam')}</Link>
          </div>
        )} />
      {examClasses.length === 0 ? <p className="text-sm text-muted">{t('exams.noPapers')}</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
            <Field id="rs-class" label={t('students.class')}>
              <Select id="rs-class" value={classId} onChange={(e) => setParams({ classId: e.target.value })}>
                {examClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field id="rs-section" label={t('students.section')}>
              <Select id="rs-section" value={sectionId} onChange={(e) => setParams(e.target.value ? { classId, sectionId: e.target.value } : { classId })}>
                <option value="">{t('students.allSections')}</option>
                {(cls?.sections ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          </div>
          {r && (
            <Card className="flex flex-wrap gap-2 p-4 text-xs font-bold" aria-label={t('attendance.summary')}>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{t('exams.sumStudents')}: {r.summary.students}</span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{t('exams.pass')}: {r.summary.passed}</span>
              <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">{t('exams.fail')}: {r.summary.failed}</span>
              {r.summary.incomplete > 0 && <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">{t('exams.incomplete')}: {r.summary.incomplete}</span>}
              {r.summary.passRate !== null && <span className="rounded-full bg-brand-50 px-3 py-1 text-brand-700">{t('exams.passRate')}: {r.summary.passRate}%</span>}
            </Card>
          )}
          <DataTable columns={columns} rows={r?.students ?? []} rowKey={(x) => x.student.id} pageSize={25} searchText={(x) => `${x.student.name} ${x.student.admissionNo}`}
            loading={results.isLoading} error={results.error ? platformError(t, results.error) : null} onRetry={() => void results.refetch()}
            emptyTitle={t('exams.noResultsTitle')} emptyDescription={t('exams.noResultsBody')} />
        </>
      )}
    </div>
  );
}
