import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { ClassSectionPicker, useClassSection } from '@/features/academics/class-section-picker';
import { tally, useMarkStudents, useSectionRoster, type AttendanceStatus, type SectionRoster } from '@/features/attendance/attendance-api';
import { AttendanceTabs } from '@/features/attendance/attendance-tabs';
import { StatusPicker } from '@/features/attendance/status-picker';
import { useAuth } from '@/features/auth/auth-context';
import { PageHeader, platformError } from '@/features/platform/common';
import { useClasses } from '@/features/students/students-api';

/** Draft of one roster. Remounted (key) whenever the section or date changes, so the draft never leaks between rosters. */
function RosterEditor({ roster, canMarkPermission }: { roster: SectionRoster; canMarkPermission: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const mark = useMarkStudents(roster.section.id);
  const [draft, setDraft] = useState<Record<string, AttendanceStatus | null>>(() => Object.fromEntries(roster.students.map((s) => [s.id, s.status])));
  const editable = canMarkPermission && roster.access.canMark;
  const counts = tally(roster.students.map((s) => draft[s.id] ?? null));
  const complete = counts.UNMARKED === 0;
  const dirty = roster.students.some((s) => (draft[s.id] ?? null) !== s.status);
  const setAll = (status: AttendanceStatus) => setDraft(Object.fromEntries(roster.students.map((s) => [s.id, status])));
  const save = async () => {
    try {
      await mark.mutateAsync({ date: roster.date, entries: roster.students.map((s) => ({ id: s.id, status: draft[s.id]!, remark: s.remark })) });
      toast.success(t('attendance.saved'));
    } catch (e) {
      toast.error(t('platform.errors.generic'), platformError(t, e));
    }
  };

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <ul className="flex flex-wrap gap-2 text-xs font-bold" aria-label={t('attendance.summary')}>
          <li className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{t('attendance.statuses.PRESENT')}: {counts.PRESENT}</li>
          <li className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">{t('attendance.statuses.ABSENT')}: {counts.ABSENT}</li>
          <li className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">{t('attendance.statuses.LATE')}: {counts.LATE}</li>
          <li className="rounded-full bg-sky-50 px-3 py-1 text-sky-700">{t('attendance.statuses.LEAVE')}: {counts.LEAVE}</li>
          {counts.UNMARKED > 0 && <li className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{t('attendance.unmarked')}: {counts.UNMARKED}</li>}
        </ul>
        {editable && <Button variant="secondary" size="sm" onClick={() => setAll('PRESENT')}>{t('attendance.markAllPresent')}</Button>}
      </div>
      <ul className="divide-y divide-line/70">
        {roster.students.map((s, i) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-navy-900"><span className="me-2 text-xs font-semibold text-muted">{i + 1}.</span>{s.name}</p>
              <p className="text-xs text-muted" dir="ltr">{s.admissionNo}</p>
            </div>
            <StatusPicker name={s.name} value={draft[s.id] ?? null} disabled={!editable} onChange={(st) => setDraft((d) => ({ ...d, [s.id]: st }))} />
          </li>
        ))}
      </ul>
      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
          <p className="text-xs text-muted">{complete ? (roster.marked ? t('attendance.editing') : t('attendance.readyToSave')) : t('attendance.markEveryone')}</p>
          <Button onClick={() => void save()} disabled={!complete || !dirty} loading={mark.isPending}>{t('attendance.save')}</Button>
        </div>
      )}
    </Card>
  );
}

export default function AttendanceMarkPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const classes = useClasses();
  const { cls, section, setClassId, setSectionId } = useClassSection(classes.data);
  const [date, setDate] = useState('');
  const roster = useSectionRoster(section?.id, date);
  const r = roster.data;

  return (
    <div>
      <PageHeader title={t('attendance.title')} subtitle={t('attendance.subtitle')} />
      <AttendanceTabs />
      {classes.error ? <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, classes.error)} onRetry={() => void classes.refetch()} /> : !classes.data ? <Skeleton className="h-40" /> : classes.data.length === 0 || !section ? (
        <EmptyState title={t('attendance.noSections')} description={t('attendance.noSectionsBody')} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            <ClassSectionPicker classes={classes.data} cls={cls} section={section} onClass={setClassId} onSection={setSectionId} idPrefix="att" />
            <Field id="att-date" label={t('attendance.date')}>
              <Input id="att-date" type="date" dir="ltr" value={date || r?.date || ''} max={r?.today} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          {roster.error ? <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, roster.error)} onRetry={() => void roster.refetch()} /> : !r ? <Skeleton className="h-64" /> : (
            <>
              {r.holiday && <p role="status" className="rounded-control bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{t('attendance.holiday', { title: r.holiday.title })}</p>}
              {!r.access.canMark && r.access.reason && !r.holiday && <p role="status" className="rounded-control bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700">{t(`attendance.blocked.${r.access.reason}`)}</p>}
              {r.students.length === 0 ? <EmptyState title={t('attendance.noStudents')} description={t('attendance.noStudentsBody')} /> : <RosterEditor key={`${r.section.id}-${r.date}-${r.marked}-${r.students.map((s) => s.status ?? '-').join('')}`} roster={r} canMarkPermission={can('attendance.mark')} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}
