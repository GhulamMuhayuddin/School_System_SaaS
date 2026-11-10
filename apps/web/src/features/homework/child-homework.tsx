import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { fmtDate } from '@/features/platform/common';
import { statusTone, stateTone, useChildHomework } from './homework-api';

/** Homework of one child for the parent portal: newest due date first, with what the teacher has recorded. */
export function ChildHomeworkList({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation();
  const { data, isLoading, error } = useChildHomework(studentId);
  if (isLoading) return <p className="text-sm text-muted">{t('common.loading')}</p>;
  if (error || !data) return <p className="text-sm text-rose-700">{t('homework.loadFailed')}</p>;
  if (data.length === 0) return <p className="text-sm text-muted">{t('homework.portalEmpty')}</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {data.slice(0, 8).map((h) => (
        <li key={h.id} className="py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-navy-900">{h.title} <span className="font-normal text-muted">· {h.subject}</span></span>
            <Badge tone={statusTone(h.status)}>{t(`homework.status.${h.status}`)}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            <Badge tone={stateTone(h.state)} className="me-2">{t(`homework.state.${h.state}`)}</Badge>{t('homework.dueOn', { date: fmtDate(h.dueDate, i18n.language) })}
            {h.marks !== null && h.maxMarks !== null ? ` · ${t('homework.marksOf', { marks: h.marks, max: h.maxMarks })}` : ''}
          </p>
          {h.description ? <p className="mt-1 text-sm text-slate-700">{h.description}</p> : null}
          {h.remark ? <p className="mt-1 text-xs text-muted">{t('homework.teacherRemark')}: {h.remark}</p> : null}
        </li>
      ))}
    </ul>
  );
}
