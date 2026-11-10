import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { ATTENDANCE_STATUSES, type AttendanceStatus } from './attendance-api';

export const statusStyle: Record<AttendanceStatus, { on: string; chip: string; letter: string }> = {
  PRESENT: { on: 'bg-emerald-600 text-white ring-emerald-600', chip: 'bg-emerald-50 text-emerald-700', letter: 'P' },
  ABSENT: { on: 'bg-rose-600 text-white ring-rose-600', chip: 'bg-rose-50 text-rose-700', letter: 'A' },
  LATE: { on: 'bg-amber-500 text-white ring-amber-500', chip: 'bg-amber-50 text-amber-800', letter: 'L' },
  LEAVE: { on: 'bg-sky-600 text-white ring-sky-600', chip: 'bg-sky-50 text-sky-700', letter: 'Lv' },
};

/** Four toggle buttons (Present / Absent / Late / Leave) for one person. */
export function StatusPicker({ name, value, onChange, disabled }: { name: string; value: AttendanceStatus | null; onChange: (s: AttendanceStatus) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={name} className="inline-flex flex-wrap gap-1">
      {ATTENDANCE_STATUSES.map((s) => (
        <button key={s} type="button" disabled={disabled} aria-pressed={value === s} aria-label={`${name}: ${t(`attendance.statuses.${s}`)}`} onClick={() => onChange(s)}
          className={cn('min-w-[3.25rem] rounded-md px-2.5 py-1.5 text-xs font-bold ring-1 ring-line transition disabled:cursor-not-allowed disabled:opacity-60',
            value === s ? statusStyle[s].on : 'bg-white text-muted hover:bg-canvas')}>
          {t(`attendance.statuses.${s}`)}
        </button>
      ))}
    </div>
  );
}
