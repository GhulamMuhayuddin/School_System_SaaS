import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { dayKey, type AttendanceStatus, type Totals } from './attendance-api';
import { statusStyle } from './status-picker';

export interface GridRow { id: string; label: string; sub: string; records: Record<string, AttendanceStatus>; totals: Totals }

/** Month sheet: one row per person, one column per day (holidays shaded), then totals and attendance %. */
export function MonthlyGrid({ month, days, holidays, rows }: { month: string; days: number; holidays: string[]; rows: GridRow[] }) {
  const { t } = useTranslation();
  const off = new Set(holidays);
  const list = Array.from({ length: days }, (_, i) => i + 1);
  return (
    <div className="overflow-x-auto rounded-card bg-white ring-1 ring-line">
      <table className="w-full min-w-max border-collapse text-xs" dir="ltr">
        <thead>
          <tr className="bg-canvas text-muted">
            <th scope="col" className="sticky start-0 z-10 bg-canvas px-3 py-2 text-start font-semibold">{t('attendance.person')}</th>
            {list.map((d) => <th key={d} scope="col" className={cn('w-7 px-0.5 py-2 text-center font-semibold', off.has(dayKey(month, d)) && 'bg-amber-50 text-amber-800')}>{d}</th>)}
            {(['PRESENT', 'ABSENT', 'LATE', 'LEAVE'] as const).map((s) => <th key={s} scope="col" className="px-2 py-2 text-center font-semibold" title={t(`attendance.statuses.${s}`)}>{statusStyle[s].letter}</th>)}
            <th scope="col" className="px-3 py-2 text-center font-semibold">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line/70">
              <th scope="row" className="sticky start-0 z-10 bg-white px-3 py-2 text-start font-semibold text-navy-900"><span className="block whitespace-nowrap">{r.label}</span><span className="block font-normal text-muted">{r.sub}</span></th>
              {list.map((d) => {
                const key = dayKey(month, d);
                const s = r.records[key];
                return (
                  <td key={d} className={cn('px-0.5 py-1.5 text-center', off.has(key) && 'bg-amber-50/70')}>
                    {s ? <span title={t(`attendance.statuses.${s}`)} aria-label={`${d}: ${t(`attendance.statuses.${s}`)}`} className={cn('inline-block min-w-[1.4rem] rounded px-1 py-0.5 font-bold', statusStyle[s].chip)}>{statusStyle[s].letter}</span> : <span aria-hidden className="text-slate-300">·</span>}
                  </td>
                );
              })}
              <td className="px-2 text-center">{r.totals.present}</td>
              <td className="px-2 text-center">{r.totals.absent}</td>
              <td className="px-2 text-center">{r.totals.late}</td>
              <td className="px-2 text-center">{r.totals.leave}</td>
              <td className="px-3 text-center font-bold text-navy-900">{r.totals.percentage === null ? '—' : `${r.totals.percentage}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
