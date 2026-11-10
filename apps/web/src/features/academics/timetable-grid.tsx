import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { WEEK_DAYS, type PeriodDto } from './academics-api';

interface GridProps {
  periods: PeriodDto[];
  /** Days to show. Defaults to Monday-Saturday; Sunday appears when a lesson is placed on it (see visibleDays). */
  days: readonly number[];
  /** What to show in a cell; return null for an empty cell. */
  cell: (day: number, period: PeriodDto) => ReactNode;
  /** When set, empty and filled cells become buttons (teachers' and viewers' grids stay read-only). */
  onCellClick?: (day: number, period: PeriodDto) => void;
  /** Accessible name for the button of a cell, for example "Monday, Period 1". */
  cellLabel?: (day: number, period: PeriodDto) => string;
}

/** Days with lessons plus Monday-Saturday; Sunday is only shown when it is used. */
export function visibleDays(usedDays: number[]): number[] {
  return WEEK_DAYS.filter((d) => d <= 6 || usedDays.includes(d));
}

/** Weekly grid: one row per period, one column per day. Breaks are shown as a single wide row. */
export function TimetableGrid({ periods, days, cell, onCellClick, cellLabel }: GridProps) {
  const { t } = useTranslation();
  const dayName = (d: number) => t(`timetable.days.${d}`);
  return (
    <div className="overflow-x-auto rounded-card ring-1 ring-line">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="bg-canvas text-start">
            <th scope="col" className="px-3 py-2 text-start text-xs font-bold uppercase tracking-wide text-muted">{t('timetable.period')}</th>
            {days.map((d) => <th key={d} scope="col" className="px-3 py-2 text-start text-xs font-bold uppercase tracking-wide text-muted">{dayName(d)}</th>)}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.id} className="border-t border-line align-top">
              <th scope="row" className="whitespace-nowrap bg-canvas/60 px-3 py-2 text-start">
                <span className="block font-bold text-navy-900">{p.name}</span>
                <span dir="ltr" className="block text-xs font-normal text-muted">{p.startTime} – {p.endTime}</span>
              </th>
              {p.isBreak ? (
                <td colSpan={days.length} className="bg-amber-50/60 px-3 py-2 text-center text-xs font-semibold text-amber-800">{t('timetable.break')}</td>
              ) : (
                days.map((d) => {
                  const content = cell(d, p);
                  const label = cellLabel?.(d, p) ?? `${dayName(d)}, ${p.name}`;
                  return (
                    <td key={d} className="p-1.5">
                      {onCellClick ? (
                        <button
                          type="button"
                          aria-label={label}
                          onClick={() => onCellClick(d, p)}
                          className={cn('block min-h-14 w-full rounded-control px-2 py-1.5 text-start transition-colors', content ? 'bg-brand-50 hover:bg-brand-100' : 'border border-dashed border-line text-muted hover:bg-canvas')}
                        >
                          {content ?? <span aria-hidden className="text-lg leading-none">+</span>}
                        </button>
                      ) : (
                        <div className={cn('min-h-14 rounded-control px-2 py-1.5', content ? 'bg-brand-50' : 'bg-canvas/40')}>{content}</div>
                      )}
                    </td>
                  );
                })
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
