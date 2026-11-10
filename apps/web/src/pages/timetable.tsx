import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  useClassSubjects, useEntryActions, useMyTimetable, useSectionTimetable, useTeacherTimetable, useTeachers, type PeriodDto, type SectionTimetable,
} from '@/features/academics/academics-api';
import { ClassSectionPicker, useClassSection } from '@/features/academics/class-section-picker';
import { TimetableGrid, visibleDays } from '@/features/academics/timetable-grid';
import { useAuth } from '@/features/auth/auth-context';
import { PageHeader, platformError } from '@/features/platform/common';
import { useClasses } from '@/features/students/students-api';

type Entry = SectionTimetable['entries'][number];

function LessonModal({ sectionId, classId, day, period, entry, onClose }: { sectionId: string; classId: string; day: number; period: PeriodDto; entry?: Entry; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const subjects = useClassSubjects(classId);
  const a = useEntryActions();
  const [subjectId, setSubjectId] = useState(entry?.subject.id ?? '');
  const [room, setRoom] = useState(entry?.room ?? '');
  const [error, setError] = useState<string | null>(null);
  const list = subjects.data?.subjects ?? [];

  const run = async (action: () => Promise<unknown>, done: string) => {
    setError(null);
    try {
      await action();
      toast.success(done);
      onClose();
    } catch (e) {
      setError(platformError(t, e));
    }
  };

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('timetable.lessonTitle', { day: t(`timetable.days.${day}`), period: period.name })}
      footer={
        <>
          {entry && <Button variant="danger" loading={a.remove.isPending} onClick={() => void run(() => a.remove.mutateAsync(entry.id), t('timetable.removed'))}>{t('timetable.remove')}</Button>}
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button loading={a.set.isPending} disabled={!subjectId} onClick={() => void run(() => a.set.mutateAsync({ sectionId, dayOfWeek: day, periodId: period.id, subjectId, room: room.trim() || null }), t('timetable.saved'))}>{t('timetable.save')}</Button>
        </>
      }>
      <div className="space-y-4">
        {error && <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
        {subjects.isLoading ? <Skeleton className="h-10" /> : list.length === 0 ? <p className="text-sm text-muted">{t('timetable.noSubjectsForClass')}</p> : (
          <>
            <Field id="ln-subject" label={t('timetable.subject')}>
              <Select id="ln-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="">{t('timetable.subjectChoose')}</option>
                {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field id="ln-room" label={t('timetable.room')}><Input id="ln-room" value={room} onChange={(e) => setRoom(e.target.value)} maxLength={30} /></Field>
          </>
        )}
      </div>
    </Modal>
  );
}

function ClassMode({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  const classes = useClasses();
  const { cls, section, setClassId, setSectionId } = useClassSection(classes.data);
  const timetable = useSectionTimetable(section?.id);
  const [cell, setCell] = useState<{ day: number; period: PeriodDto } | null>(null);

  if (classes.error) return <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, classes.error)} onRetry={() => void classes.refetch()} />;
  if (classes.isLoading || !classes.data) return <Skeleton className="h-64" />;
  if (classes.data.length === 0) return <EmptyState title={t('timetable.noClasses')} />;

  const data = timetable.data;
  const entryAt = (day: number, period: PeriodDto) => data?.entries.find((e) => e.dayOfWeek === day && e.period.id === period.id);
  return (
    <div className="space-y-4">
      <ClassSectionPicker idPrefix="tt" classes={classes.data} cls={cls} section={section} onClass={setClassId} onSection={setSectionId} />
      {!section ? <EmptyState title={t('timetable.noSections')} />
        : timetable.error ? <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, timetable.error)} onRetry={() => void timetable.refetch()} />
        : timetable.isLoading || !data ? <Skeleton className="h-64" />
        : data.periods.length === 0 ? <EmptyState title={t('timetable.noPeriods')} description={t('timetable.noPeriodsBody')} />
        : (
          <>
            <p className="text-sm text-muted">{t('timetable.session', { name: data.session.name })}</p>
            <TimetableGrid
              periods={data.periods}
              days={visibleDays(data.entries.map((e) => e.dayOfWeek))}
              onCellClick={canEdit ? (day, period) => setCell({ day, period }) : undefined}
              cell={(day, period) => {
                const e = entryAt(day, period);
                return e ? (
                  <>
                    <span className="block text-sm font-bold text-navy-900">{e.subject.name}</span>
                    <span className="block text-xs text-muted">{e.staff?.name ?? t('timetable.noTeacher')}{e.room ? ` · ${e.room}` : ''}</span>
                  </>
                ) : null;
              }}
            />
          </>
        )}
      {cell && section && cls && <LessonModal sectionId={section.id} classId={cls.id} day={cell.day} period={cell.period} entry={entryAt(cell.day, cell.period)} onClose={() => setCell(null)} />}
    </div>
  );
}

function TeacherMode() {
  const { t } = useTranslation();
  const teachers = useTeachers();
  const [choice, setChoice] = useState('me');
  const mine = useMyTimetable(choice === 'me');
  const other = useTeacherTimetable(choice === 'me' ? undefined : choice);
  const active = choice === 'me' ? mine : other;
  const data = active.data;
  const noProfile = choice === 'me' && mine.error instanceof ApiError && mine.error.status === 404;

  return (
    <div className="space-y-4">
      <div className="lg:max-w-sm">
        <Field id="tt-teacher" label={t('timetable.teacher')}>
          <Select id="tt-teacher" value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="me">{t('timetable.myTimetable')}</option>
            {(teachers.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.employeeNo})</option>)}
          </Select>
        </Field>
      </div>
      {noProfile ? <EmptyState title={t('timetable.noProfile')} />
        : active.error ? <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, active.error)} onRetry={() => void active.refetch()} />
        : active.isLoading || !data ? <Skeleton className="h-64" />
        : data.periods.length === 0 ? <EmptyState title={t('timetable.noPeriods')} description={t('timetable.noPeriodsBody')} />
        : (
          <>
            <p className="text-sm text-muted">{data.staff.name} · {t('timetable.session', { name: data.session.name })}</p>
            {data.entries.length === 0 && <p className="text-sm text-muted">{t('timetable.emptyTeacher')}</p>}
            <TimetableGrid
              periods={data.periods}
              days={visibleDays(data.entries.map((e) => e.dayOfWeek))}
              cell={(day, period) => {
                const e = data.entries.find((x) => x.dayOfWeek === day && x.period.id === period.id);
                return e ? (
                  <>
                    <span className="block text-sm font-bold text-navy-900">{e.subject.name}</span>
                    <span className="block text-xs text-muted">{e.section.className}-{e.section.name}{e.room ? ` · ${e.room}` : ''}</span>
                  </>
                ) : null;
              }}
            />
          </>
        )}
    </div>
  );
}

export default function TimetablePage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canEdit = can('academic.timetable.manage');
  const [chosen, setMode] = useState<'class' | 'teacher' | null>(null);
  // Default follows the permission, so it is right even if the user finishes loading after the first render.
  const mode = chosen ?? (canEdit ? 'class' : 'teacher');
  const tabs = ['class', 'teacher'] as const;
  return (
    <div>
      <PageHeader title={t('timetable.title')} subtitle={t('timetable.subtitle')} />
      <div role="tablist" aria-label={t('timetable.title')} className="mb-5 flex gap-1 rounded-control bg-white p-1 ring-1 ring-line sm:inline-flex">
        {tabs.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)}
            className={mode === id ? 'rounded-md bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white' : 'rounded-md px-4 py-1.5 text-sm font-semibold text-muted hover:bg-canvas hover:text-navy-900'}>
            {t(id === 'class' ? 'timetable.tabClass' : 'timetable.tabTeacher')}
          </button>
        ))}
      </div>
      {mode === 'class' ? <ClassMode canEdit={canEdit} /> : <TeacherMode />}
    </div>
  );
}
