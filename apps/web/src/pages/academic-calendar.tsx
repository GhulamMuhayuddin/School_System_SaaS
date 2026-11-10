import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { EVENT_TYPES, useCalendarEvents, useEventActions, type CalendarEventDto, type EventType } from '@/features/academics/planning-api';
import { buildMonthGrid, eventsInMonth, eventsOnDay, gridRange, shiftMonth, toIso } from '@/features/academics/calendar-utils';
import { useAuth } from '@/features/auth/auth-context';
import { PageHeader, fmtDate, platformError } from '@/features/platform/common';
import { cn } from '@/lib/cn';

const typeTone = { HOLIDAY: 'danger', EVENT: 'brand', EXAM: 'warning', OTHER: 'neutral' } as const;
const chipClass: Record<EventType, string> = {
  HOLIDAY: 'bg-rose-50 text-rose-700',
  EVENT: 'bg-brand-50 text-brand-700',
  EXAM: 'bg-amber-50 text-amber-800',
  OTHER: 'bg-slate-100 text-slate-700',
};

type Dialog = { event?: CalendarEventDto; date?: string } | null;

function EventModal({ event, date, onClose }: { event?: CalendarEventDto; date?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const a = useEventActions();
  const [title, setTitle] = useState(event?.title ?? '');
  const [type, setType] = useState<EventType>(event?.type ?? 'EVENT');
  const [start, setStart] = useState(event?.startDate ?? date ?? '');
  const [end, setEnd] = useState(event && event.endDate !== event.startDate ? event.endDate : '');
  const [notes, setNotes] = useState(event?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const datesOk = Boolean(start) && (!end || end >= start);

  const save = async () => {
    setError(null);
    try {
      const body = { title: title.trim(), type, startDate: start, endDate: end || start, description: notes.trim() || null };
      if (event) await a.update.mutateAsync({ id: event.id, ...body });
      else await a.create.mutateAsync(body);
      toast.success(t('calendar.saved'));
      onClose();
    } catch (e) {
      setError(platformError(t, e));
    }
  };
  const remove = async () => {
    if (!event) return;
    try {
      await a.remove.mutateAsync(event.id);
      toast.success(t('calendar.deleted'));
      onClose();
    } catch (e) {
      setConfirm(false);
      setError(platformError(t, e));
    }
  };

  return (
    <>
      <Modal open onOpenChange={(o) => !o && onClose()} title={event ? t('calendar.edit') : t('calendar.add')}
        footer={
          <>
            {event && <Button variant="danger" onClick={() => setConfirm(true)}>{t('calendar.delete')}</Button>}
            <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
            <Button onClick={() => void save()} disabled={!title.trim() || !datesOk} loading={a.create.isPending || a.update.isPending}>{t('calendar.save')}</Button>
          </>
        }>
        <div className="space-y-4">
          {error && <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
          <Field id="ev-title" label={t('calendar.titleLabel')}><Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} /></Field>
          <Field id="ev-type" label={t('calendar.type')}>
            <Select id="ev-type" value={type} onChange={(e) => setType(e.target.value as EventType)}>
              {EVENT_TYPES.map((x) => <option key={x} value={x}>{t(`calendar.types.${x}`)}</option>)}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="ev-start" label={t('calendar.start')}><Input id="ev-start" type="date" dir="ltr" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field id="ev-end" label={t('calendar.end')} error={start && end && end < start ? t('calendar.invalidDates') : undefined}>
              <Input id="ev-end" type="date" dir="ltr" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
          <Field id="ev-notes" label={t('calendar.notes')}><Textarea id="ev-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} /></Field>
        </div>
      </Modal>
      {confirm && event && (
        <ConfirmDialog open onOpenChange={(o) => !o && setConfirm(false)} title={t('calendar.deleteTitle', { title: event.title })} description={t('calendar.deleteBody')}
          confirmLabel={t('calendar.delete')} danger loading={a.remove.isPending} onConfirm={remove} />
      )}
    </>
  );
}

export default function AcademicCalendarPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const manage = can('academic.manage');
  const locale = i18n.language === 'ur' ? 'ur-PK' : 'en-GB';
  const today = toIso(new Date());
  const [ym, setYm] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }));
  const [dialog, setDialog] = useState<Dialog>(null);

  const weeks = useMemo(() => buildMonthGrid(ym.year, ym.month, today), [ym, today]);
  const range = gridRange(weeks);
  const { data, isLoading, error, refetch } = useCalendarEvents(range.from, range.to);
  const events = data ?? [];
  const monthEvents = eventsInMonth(events, ym.year, ym.month);
  const monthTitle = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(ym.year, ym.month, 1)));
  const weekdayNames = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 2, 2 + i)))); // 2 March 2026 is a Monday

  return (
    <div>
      <PageHeader title={t('calendar.title')} subtitle={t('calendar.subtitle')}
        action={manage ? <Button onClick={() => setDialog({ date: today })}><Plus className="size-4" aria-hidden />{t('calendar.add')}</Button> : undefined} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" aria-label={t('calendar.prev')} onClick={() => setYm(shiftMonth(ym.year, ym.month, -1))}><ChevronLeft className="size-4 rtl:rotate-180" aria-hidden /></Button>
        <h2 className="min-w-40 text-center text-lg font-extrabold text-navy-900" aria-live="polite">{monthTitle}</h2>
        <Button variant="secondary" size="sm" aria-label={t('calendar.next')} onClick={() => setYm(shiftMonth(ym.year, ym.month, 1))}><ChevronRight className="size-4 rtl:rotate-180" aria-hidden /></Button>
        <Button variant="ghost" size="sm" onClick={() => setYm({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 })}>{t('calendar.today')}</Button>
      </div>

      {error ? <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, error)} onRetry={() => void refetch()} />
        : isLoading ? <Skeleton className="h-96" />
        : (
          <>
            <div className="overflow-x-auto rounded-card ring-1 ring-line">
              <div className="grid min-w-[42rem] grid-cols-7 bg-canvas text-xs font-bold uppercase tracking-wide text-muted">
                {weekdayNames.map((n) => <div key={n} className="px-2 py-2">{n}</div>)}
              </div>
              <div className="grid min-w-[42rem] grid-cols-7 border-t border-line bg-white">
                {weeks.flat().map((cell) => {
                  const day = eventsOnDay(events, cell.iso);
                  return (
                    <div key={cell.iso} className={cn('min-h-24 border-b border-e border-line p-1.5', !cell.inMonth && 'bg-canvas/50 text-muted')}>
                      <div className="flex items-center justify-between">
                        {manage ? (
                          <button type="button" aria-label={t('calendar.addOn', { date: fmtDate(cell.iso, i18n.language) })} onClick={() => setDialog({ date: cell.iso })}
                            className={cn('flex size-6 items-center justify-center rounded-full text-xs font-bold hover:bg-brand-50', cell.isToday && 'bg-brand-600 text-white hover:bg-brand-700')}>{cell.day}</button>
                        ) : (
                          <span className={cn('flex size-6 items-center justify-center rounded-full text-xs font-bold', cell.isToday && 'bg-brand-600 text-white')}>{cell.day}</span>
                        )}
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {day.slice(0, 2).map((e) => (
                          <li key={e.id}>
                            {manage ? (
                              <button type="button" onClick={() => setDialog({ event: e })} className={cn('block w-full truncate rounded px-1.5 py-0.5 text-start text-xs font-semibold', chipClass[e.type])}>{e.title}</button>
                            ) : (
                              <span className={cn('block truncate rounded px-1.5 py-0.5 text-xs font-semibold', chipClass[e.type])}>{e.title}</span>
                            )}
                          </li>
                        ))}
                        {day.length > 2 && <li className="px-1.5 text-xs font-semibold text-muted">{t('calendar.more', { count: day.length - 2 })}</li>}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>

            <h3 className="mb-2 mt-6 text-base font-extrabold text-navy-900">{t('calendar.thisMonth')}</h3>
            {monthEvents.length === 0 ? (
              <p className="text-sm text-muted">{t('calendar.none')}</p>
            ) : (
              <Card className="divide-y divide-line">
                {monthEvents.map((e) => (
                  <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-bold text-navy-900">{e.title} <Badge tone={typeTone[e.type]} className="ms-1">{t(`calendar.types.${e.type}`)}</Badge></p>
                      <p className="text-sm text-muted">{e.startDate === e.endDate ? fmtDate(e.startDate, i18n.language) : `${fmtDate(e.startDate, i18n.language)} – ${fmtDate(e.endDate, i18n.language)}`}</p>
                      {e.description && <p className="mt-0.5 text-sm text-muted">{e.description}</p>}
                    </div>
                    {manage && <Button size="sm" variant="ghost" onClick={() => setDialog({ event: e })}>{t('calendar.editButton')}</Button>}
                  </div>
                ))}
              </Card>
            )}
          </>
        )}
      {dialog && <EventModal event={dialog.event} date={dialog.date} onClose={() => setDialog(null)} />}
    </div>
  );
}
