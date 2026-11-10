import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/states';
import { fmtDate } from '@/features/platform/common';
import { useStudentHistory } from './attendance-api';
import { statusStyle } from './status-picker';

const DAYS = 30;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Attendance of one student over the last 30 days (shown on the student page to people who may read attendance). */
export function StudentAttendanceCard({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation();
  const to = iso(new Date());
  const from = iso(new Date(Date.now() - (DAYS - 1) * 86_400_000));
  const { data, isLoading, error } = useStudentHistory(studentId, from, to);
  if (error) return null; // the rest of the student page stays useful; a failure here is not worth a full-page error
  const absences = (data?.records ?? []).filter((r) => r.status === 'ABSENT').slice(-5).reverse();
  const pct = data?.totals.percentage ?? null;
  return (
    <Card className="p-5">
      <CardHeader title={t('attendance.studentCardTitle')} description={t('attendance.studentCardNote', { days: DAYS })} />
      {isLoading || !data ? <Skeleton className="mt-4 h-16" /> : data.totals.marked === 0 ? <p className="mt-3 text-sm text-muted">{t('attendance.studentCardEmpty')}</p> : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <Badge tone={pct !== null && pct >= 75 ? 'success' : pct !== null && pct >= 50 ? 'warning' : 'danger'}>{pct}%</Badge>
            {(['PRESENT', 'ABSENT', 'LATE', 'LEAVE'] as const).map((s) => (
              <span key={s} className={`rounded-full px-3 py-1 ${statusStyle[s].chip}`}>{t(`attendance.statuses.${s}`)}: {data.totals[s.toLowerCase() as 'present' | 'absent' | 'late' | 'leave']}</span>
            ))}
          </div>
          {absences.length > 0 && (
            <p className="text-sm text-muted">{t('attendance.recentAbsences')}: {absences.map((a) => fmtDate(a.date, i18n.language)).join(', ')}</p>
          )}
        </div>
      )}
    </Card>
  );
}
