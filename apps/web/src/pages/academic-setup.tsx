import { useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  usePeriodActions, usePeriods, useSessionActions, useSessions, useSubjectActions, useSubjects, type PeriodDto, type SessionDto, type SubjectDto,
} from '@/features/academics/academics-api';
import { useAuth } from '@/features/auth/auth-context';
import { PageHeader, fmtDate, platformError } from '@/features/platform/common';

const errorBox = (message: string | null) => message && <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{message}</p>;

function Cancel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>;
}

function List({ children }: { children: ReactNode }) {
  return <Card className="divide-y divide-line">{children}</Card>;
}

// ------------------------------------------------------------------ sessions

function SessionModal({ session, onClose }: { session?: SessionDto; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const a = useSessionActions();
  const [name, setName] = useState(session?.name ?? '');
  const [start, setStart] = useState(session?.startDate ?? '');
  const [end, setEnd] = useState(session?.endDate ?? '');
  const [current, setCurrent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const datesOk = Boolean(start) && Boolean(end) && end > start;

  const save = async () => {
    setError(null);
    try {
      if (session) await a.update.mutateAsync({ id: session.id, name: name.trim(), startDate: start, endDate: end });
      else await a.create.mutateAsync({ name: name.trim(), startDate: start, endDate: end, isCurrent: current });
      toast.success(t('academicSetup.saved'));
      onClose();
    } catch (e) {
      setError(platformError(t, e));
    }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={session ? t('academicSetup.sessions.edit') : t('academicSetup.sessions.add')}
      footer={<><Cancel onClose={onClose} /><Button onClick={() => void save()} disabled={!name.trim() || !datesOk} loading={a.create.isPending || a.update.isPending}>{t('academicSetup.save')}</Button></>}>
      <div className="space-y-4">
        {errorBox(error)}
        <Field id="se-name" label={t('academicSetup.name')}><Input id="se-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="2026-2027" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="se-start" label={t('academicSetup.sessions.start')}><Input id="se-start" type="date" dir="ltr" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field id="se-end" label={t('academicSetup.sessions.end')} error={start && end && !datesOk ? t('academicSetup.sessions.invalidDates') : undefined}>
            <Input id="se-end" type="date" dir="ltr" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        {!session && (
          <label className="flex items-center gap-2 text-sm font-medium text-navy-900">
            <input type="checkbox" className="size-4 accent-brand-600" checked={current} onChange={(e) => setCurrent(e.target.checked)} />
            {t('academicSetup.sessions.makeCurrent')}
          </label>
        )}
      </div>
    </Modal>
  );
}

function SessionsTab() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { can } = useAuth();
  const { data, isLoading, error, refetch } = useSessions();
  const a = useSessionActions();
  const manage = can('school.session.manage');
  const [dialog, setDialog] = useState<{ session?: SessionDto } | null>(null);
  const [confirm, setConfirm] = useState<SessionDto | null>(null);
  const fail = (e: unknown) => toast.error(t('platform.errors.generic'), platformError(t, e));

  return (
    <div>
      {manage && <div className="mb-4 flex justify-end"><Button onClick={() => setDialog({})}><Plus className="size-4" aria-hidden />{t('academicSetup.sessions.add')}</Button></div>}
      {error ? <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, error)} onRetry={() => void refetch()} />
        : isLoading || !data ? <Skeleton className="h-32" />
        : data.length === 0 ? <EmptyState title={t('academicSetup.sessions.empty')} description={t('academicSetup.sessions.emptyBody')} />
        : (
          <List>
            {data.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-bold text-navy-900">{s.name} {s.isCurrent && <Badge tone="success" className="ms-1">{t('academicSetup.sessions.current')}</Badge>}</p>
                  <p className="text-sm text-muted">{fmtDate(s.startDate, i18n.language)} – {fmtDate(s.endDate, i18n.language)}</p>
                </div>
                {manage && (
                  <div className="flex flex-wrap gap-1">
                    {!s.isCurrent && <Button size="sm" variant="secondary" onClick={() => a.setCurrent.mutateAsync(s.id).then(() => toast.success(t('academicSetup.saved'))).catch(fail)}>{t('academicSetup.sessions.makeCurrentButton')}</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ session: s })}>{t('academicSetup.edit')}</Button>
                    <Button size="sm" variant="ghost" aria-label={`${t('academicSetup.delete')} ${s.name}`} onClick={() => setConfirm(s)}><Trash2 className="size-4 text-rose-600" aria-hidden /></Button>
                  </div>
                )}
              </div>
            ))}
          </List>
        )}
      {dialog && <SessionModal session={dialog.session} onClose={() => setDialog(null)} />}
      {confirm && (
        <ConfirmDialog open onOpenChange={(o) => !o && setConfirm(null)} title={t('academicSetup.sessions.deleteTitle', { name: confirm.name })} description={t('academicSetup.deleteBody')} confirmLabel={t('academicSetup.delete')} danger
          loading={a.remove.isPending} onConfirm={() => a.remove.mutateAsync(confirm.id).then(() => { toast.success(t('academicSetup.deleted')); setConfirm(null); }).catch((e) => { fail(e); setConfirm(null); })} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ subjects

function SubjectModal({ subject, onClose }: { subject?: SubjectDto; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const a = useSubjectActions();
  const [name, setName] = useState(subject?.name ?? '');
  const [code, setCode] = useState(subject?.code ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    try {
      if (subject) await a.update.mutateAsync({ id: subject.id, name: name.trim(), code: code.trim() || null });
      else await a.create.mutateAsync({ name: name.trim(), code: code.trim() || null });
      toast.success(t('academicSetup.saved'));
      onClose();
    } catch (e) {
      setError(platformError(t, e));
    }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={subject ? t('academicSetup.subjects.edit') : t('academicSetup.subjects.add')}
      footer={<><Cancel onClose={onClose} /><Button onClick={() => void save()} disabled={!name.trim()} loading={a.create.isPending || a.update.isPending}>{t('academicSetup.save')}</Button></>}>
      <div className="space-y-4">
        {errorBox(error)}
        <Field id="sb-name" label={t('academicSetup.subjects.name')}><Input id="sb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mathematics" /></Field>
        <Field id="sb-code" label={t('academicSetup.subjects.code')}><Input id="sb-code" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} placeholder="MTH" maxLength={20} /></Field>
      </div>
    </Modal>
  );
}

function SubjectsTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const { can } = useAuth();
  const { data, isLoading, error, refetch } = useSubjects();
  const a = useSubjectActions();
  const manage = can('academic.manage');
  const [dialog, setDialog] = useState<{ subject?: SubjectDto } | null>(null);
  const [confirm, setConfirm] = useState<SubjectDto | null>(null);
  const fail = (e: unknown) => toast.error(t('platform.errors.generic'), platformError(t, e));

  return (
    <div>
      {manage && <div className="mb-4 flex justify-end"><Button onClick={() => setDialog({})}><Plus className="size-4" aria-hidden />{t('academicSetup.subjects.add')}</Button></div>}
      {error ? <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, error)} onRetry={() => void refetch()} />
        : isLoading || !data ? <Skeleton className="h-32" />
        : data.length === 0 ? <EmptyState title={t('academicSetup.subjects.empty')} description={t('academicSetup.subjects.emptyBody')} />
        : (
          <List>
            {data.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-bold text-navy-900">{s.name} {s.code && <span dir="ltr" className="ms-1 text-xs font-semibold text-muted">{s.code}</span>}</p>
                  <p className="text-sm text-muted">{t('academicSetup.subjects.classes', { count: s.classCount })}</p>
                </div>
                {manage && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ subject: s })}>{t('academicSetup.edit')}</Button>
                    <Button size="sm" variant="ghost" aria-label={`${t('academicSetup.delete')} ${s.name}`} onClick={() => setConfirm(s)}><Trash2 className="size-4 text-rose-600" aria-hidden /></Button>
                  </div>
                )}
              </div>
            ))}
          </List>
        )}
      {dialog && <SubjectModal subject={dialog.subject} onClose={() => setDialog(null)} />}
      {confirm && (
        <ConfirmDialog open onOpenChange={(o) => !o && setConfirm(null)} title={t('academicSetup.subjects.deleteTitle', { name: confirm.name })} description={t('academicSetup.deleteBody')} confirmLabel={t('academicSetup.delete')} danger
          loading={a.remove.isPending} onConfirm={() => a.remove.mutateAsync(confirm.id).then(() => { toast.success(t('academicSetup.deleted')); setConfirm(null); }).catch((e) => { fail(e); setConfirm(null); })} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ periods

function PeriodModal({ period, onClose }: { period?: PeriodDto; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const a = usePeriodActions();
  const [name, setName] = useState(period?.name ?? '');
  const [start, setStart] = useState(period?.startTime ?? '');
  const [end, setEnd] = useState(period?.endTime ?? '');
  const [isBreak, setIsBreak] = useState(period?.isBreak ?? false);
  const [error, setError] = useState<string | null>(null);
  const timesOk = Boolean(start) && Boolean(end) && end > start;
  const save = async () => {
    setError(null);
    try {
      if (period) await a.update.mutateAsync({ id: period.id, name: name.trim(), startTime: start, endTime: end, isBreak });
      else await a.create.mutateAsync({ name: name.trim(), startTime: start, endTime: end, isBreak });
      toast.success(t('academicSetup.saved'));
      onClose();
    } catch (e) {
      setError(platformError(t, e));
    }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={period ? t('academicSetup.periods.edit') : t('academicSetup.periods.add')}
      footer={<><Cancel onClose={onClose} /><Button onClick={() => void save()} disabled={!name.trim() || !timesOk} loading={a.create.isPending || a.update.isPending}>{t('academicSetup.save')}</Button></>}>
      <div className="space-y-4">
        {errorBox(error)}
        <Field id="pd-name" label={t('academicSetup.name')}><Input id="pd-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Period 1" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="pd-start" label={t('academicSetup.periods.start')}><Input id="pd-start" type="time" dir="ltr" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field id="pd-end" label={t('academicSetup.periods.end')} error={start && end && !timesOk ? t('academicSetup.periods.invalidTimes') : undefined}>
            <Input id="pd-end" type="time" dir="ltr" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-navy-900">
          <input type="checkbox" className="size-4 accent-brand-600" checked={isBreak} onChange={(e) => setIsBreak(e.target.checked)} />
          {t('academicSetup.periods.isBreak')}
        </label>
      </div>
    </Modal>
  );
}

function PeriodsTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const { can } = useAuth();
  const { data, isLoading, error, refetch } = usePeriods();
  const a = usePeriodActions();
  const manage = can('academic.timetable.manage');
  const [dialog, setDialog] = useState<{ period?: PeriodDto } | null>(null);
  const [confirm, setConfirm] = useState<PeriodDto | null>(null);
  const fail = (e: unknown) => toast.error(t('platform.errors.generic'), platformError(t, e));

  return (
    <div>
      {manage && <div className="mb-4 flex justify-end"><Button onClick={() => setDialog({})}><Plus className="size-4" aria-hidden />{t('academicSetup.periods.add')}</Button></div>}
      {error ? <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, error)} onRetry={() => void refetch()} />
        : isLoading || !data ? <Skeleton className="h-32" />
        : data.length === 0 ? <EmptyState title={t('academicSetup.periods.empty')} description={t('academicSetup.periods.emptyBody')} />
        : (
          <List>
            {data.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-bold text-navy-900">{p.name} {p.isBreak && <Badge tone="warning" className="ms-1">{t('timetable.break')}</Badge>}</p>
                  <p dir="ltr" className="text-start text-sm text-muted">{p.startTime} – {p.endTime}</p>
                </div>
                {manage && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ period: p })}>{t('academicSetup.edit')}</Button>
                    <Button size="sm" variant="ghost" aria-label={`${t('academicSetup.delete')} ${p.name}`} onClick={() => setConfirm(p)}><Trash2 className="size-4 text-rose-600" aria-hidden /></Button>
                  </div>
                )}
              </div>
            ))}
          </List>
        )}
      {dialog && <PeriodModal period={dialog.period} onClose={() => setDialog(null)} />}
      {confirm && (
        <ConfirmDialog open onOpenChange={(o) => !o && setConfirm(null)} title={t('academicSetup.periods.deleteTitle', { name: confirm.name })} description={t('academicSetup.deleteBody')} confirmLabel={t('academicSetup.delete')} danger
          loading={a.remove.isPending} onConfirm={() => a.remove.mutateAsync(confirm.id).then(() => { toast.success(t('academicSetup.deleted')); setConfirm(null); }).catch((e) => { fail(e); setConfirm(null); })} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ page

const TABS = ['sessions', 'subjects', 'periods'] as const;
type Tab = (typeof TABS)[number];

export default function AcademicSetupPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('sessions');
  return (
    <div>
      <PageHeader title={t('academicSetup.title')} subtitle={t('academicSetup.subtitle')} />
      <div role="tablist" aria-label={t('academicSetup.title')} className="mb-5 flex flex-wrap gap-1 rounded-control bg-white p-1 ring-1 ring-line">
        {TABS.map((id) => (
          <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}
            className={tab === id ? 'rounded-md bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white' : 'rounded-md px-4 py-1.5 text-sm font-semibold text-muted hover:bg-canvas hover:text-navy-900'}>
            {t(`academicSetup.tabs.${id}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'sessions' ? <SessionsTab /> : tab === 'subjects' ? <SubjectsTab /> : <PeriodsTab />}
      </div>
    </div>
  );
}
