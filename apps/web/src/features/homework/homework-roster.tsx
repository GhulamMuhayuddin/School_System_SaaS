import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { platformError } from '@/features/platform/common';
import { changedEntries, draftOf, statusTone, useSaveSubmissions, type Draft, type HomeworkDetail, type SubmissionStatus } from './homework-api';

const STATUSES: SubmissionStatus[] = ['SUBMITTED', 'LATE', 'MISSING'];

/** The teacher's checklist: who handed the work in, marks and a short remark. Parent this component with a key that changes when the saved data changes. */
export function RosterEditor({ detail, editable }: { detail: HomeworkDetail; editable: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const save = useSaveSubmissions();
  const [draft, setDraft] = useState<Draft>(() => draftOf(detail.roster));
  const entries = changedEntries(detail.roster, draft, detail.maxMarks);
  const set = (id: string, patch: Partial<Draft[string]>) => setDraft((d) => ({ ...d, [id]: { ...d[id]!, ...patch } }));
  const markAll = () => setDraft((d) => Object.fromEntries(Object.entries(d).map(([id, r]) => [id, r.status === null ? { ...r, status: 'SUBMITTED' as const } : r])));
  const submit = async () => {
    if (!entries || entries.length === 0) return;
    try { await save.mutateAsync({ id: detail.id, entries }); toast.success(t('homework.checklistSaved')); }
    catch (err) { toast.error(t('platform.errors.generic'), platformError(t, err)); }
  };
  if (detail.roster.length === 0) return <p className="text-sm text-muted">{t('homework.noStudents')}</p>;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge tone="success">{t('homework.status.SUBMITTED')}: {detail.counts.submitted}</Badge>
          <Badge tone="warning">{t('homework.status.LATE')}: {detail.counts.late}</Badge>
          <Badge tone="danger">{t('homework.status.MISSING')}: {detail.counts.missing}</Badge>
          <Badge tone="neutral">{t('homework.status.PENDING')}: {detail.counts.pending}</Badge>
        </div>
        {editable ? <Button variant="secondary" size="sm" onClick={markAll}>{t('homework.markAll')}</Button> : null}
      </div>
      <div className="overflow-x-auto rounded-card ring-1 ring-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-canvas text-start text-xs uppercase text-muted">
            <tr><th className="px-3 py-2 text-start">{t('homework.student')}</th><th className="px-3 py-2 text-start">{t('homework.statusLabel')}</th><th className="px-3 py-2 text-start">{t('homework.marks')}</th><th className="px-3 py-2 text-start">{t('homework.remark')}</th></tr>
          </thead>
          <tbody className="divide-y divide-line bg-white">
            {detail.roster.map((r) => {
              const d = draft[r.studentId]!;
              const handedIn = d.status === 'SUBMITTED' || d.status === 'LATE';
              return (
                <tr key={r.studentId}>
                  <td className="px-3 py-2"><span className="font-semibold text-navy-900">{r.name}</span><span dir="ltr" className="block text-xs text-muted">{r.admissionNo}</span></td>
                  <td className="px-3 py-2">
                    {editable ? (
                      <Select aria-label={`${t('homework.statusLabel')} ${r.name}`} value={d.status ?? ''} onChange={(e) => set(r.studentId, { status: (e.target.value || null) as SubmissionStatus | null })}>
                        <option value="">{t('homework.status.PENDING')}</option>
                        {STATUSES.map((s) => <option key={s} value={s}>{t(`homework.status.${s}`)}</option>)}
                      </Select>
                    ) : <Badge tone={statusTone(r.status ?? 'PENDING')}>{t(`homework.status.${r.status ?? 'PENDING'}`)}</Badge>}
                  </td>
                  <td className="px-3 py-2">
                    {editable ? (
                      <Input aria-label={`${t('homework.marks')} ${r.name}`} inputMode="numeric" dir="ltr" className="w-20" disabled={!handedIn || detail.maxMarks === null} value={d.marks} onChange={(e) => set(r.studentId, { marks: e.target.value })} />
                    ) : <span dir="ltr">{r.marks === null ? '—' : `${r.marks}${detail.maxMarks ? ` / ${detail.maxMarks}` : ''}`}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {editable ? <Input aria-label={`${t('homework.remark')} ${r.name}`} maxLength={200} disabled={d.status === null} value={d.remark} onChange={(e) => set(r.studentId, { remark: e.target.value })} /> : (r.remark ?? '')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editable ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => void submit()} loading={save.isPending} disabled={!entries || entries.length === 0}>{t('homework.saveChecklist')}</Button>
          {entries === null ? <span className="text-sm text-rose-700">{t('homework.marksProblem', { max: detail.maxMarks ?? 0 })}</span> : null}
          {detail.maxMarks === null ? <span className="text-sm text-muted">{t('homework.noMaxNote')}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
