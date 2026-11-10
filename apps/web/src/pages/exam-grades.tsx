import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { useGradeBands, useSetBands, type GradeBand } from '@/features/exams/exams-api';
import { ExamsTabs } from '@/features/exams/exams-tabs';
import { PageHeader, platformError } from '@/features/platform/common';

type Draft = { grade: string; min: string; remark: string };

function BandsEditor({ bands, isDefault, canEdit }: { bands: GradeBand[]; isDefault: boolean; canEdit: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const save = useSetBands();
  const [rows, setRows] = useState<Draft[]>(() => bands.map((b) => ({ grade: b.grade, min: String(b.minPercent), remark: b.remark ?? '' })));
  const patch = (i: number, v: Partial<Draft>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...v } : x)));
  const mins = rows.map((r) => Number(r.min));
  const problem = rows.length === 0 ? 'empty'
    : rows.some((r) => r.grade.trim() === '' || r.min.trim() === '' || !Number.isInteger(Number(r.min)) || Number(r.min) < 0 || Number(r.min) > 100) ? 'invalid'
      : new Set(rows.map((r) => r.grade.trim().toLowerCase())).size !== rows.length ? 'dupGrade'
        : new Set(mins).size !== mins.length ? 'dupMin'
          : !mins.includes(0) ? 'noZero' : null;
  const submit = async () => {
    try {
      await save.mutateAsync(rows.map((r) => ({ grade: r.grade.trim(), minPercent: Number(r.min), remark: r.remark.trim() || null })));
      toast.success(t('exams.gradesSaved'));
    } catch (e) {
      toast.error(t('platform.errors.generic'), platformError(t, e));
    }
  };
  return (
    <Card className="p-0">
      {isDefault && <p role="status" className="border-b border-line bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('exams.defaultScale')}</p>}
      <ul className="divide-y divide-line/70">
        {rows.map((r, i) => (
          <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Input aria-label={t('exams.grade')} className="w-24" value={r.grade} maxLength={10} disabled={!canEdit} onChange={(e) => patch(i, { grade: e.target.value })} />
            <span className="text-sm text-muted">{t('exams.from')}</span>
            <Input aria-label={t('exams.minPercent')} className="w-20 text-center" dir="ltr" inputMode="numeric" value={r.min} disabled={!canEdit} onChange={(e) => patch(i, { min: e.target.value })} />
            <span className="text-sm text-muted">%</span>
            <Input aria-label={t('exams.remark')} className="min-w-32 flex-1" value={r.remark} maxLength={60} disabled={!canEdit} onChange={(e) => patch(i, { remark: e.target.value })} />
            {canEdit && <Button variant="ghost" size="sm" aria-label={t('exams.removeGrade')} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Trash2 className="size-4 text-rose-600" aria-hidden /></Button>}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => setRows((x) => [...x, { grade: '', min: '', remark: '' }])}><Plus className="size-4" aria-hidden />{t('exams.addGrade')}</Button>
            {problem && <span role="alert" className="text-xs font-medium text-rose-600">{t(`exams.bandProblems.${problem}`)}</span>}
          </div>
          <Button onClick={() => void submit()} disabled={problem !== null} loading={save.isPending}>{t('exams.saveGrades')}</Button>
        </div>
      )}
    </Card>
  );
}

export default function ExamGradesPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const bands = useGradeBands();
  return (
    <div>
      <PageHeader title={t('exams.title')} subtitle={t('exams.gradesSubtitle')} />
      <ExamsTabs />
      {bands.error ? <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, bands.error)} onRetry={() => void bands.refetch()} />
        : !bands.data ? <Skeleton className="h-48" />
          : <BandsEditor key={bands.data.bands.map((b) => `${b.grade}${b.minPercent}${b.remark ?? ''}`).join('|')} bands={bands.data.bands} isDefault={bands.data.isDefault} canEdit={can('exam.manage')} />}
    </div>
  );
}
