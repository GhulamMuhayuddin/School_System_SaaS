import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { useApplication, useApproveApplication, useRejectApplication, type ApplicationDetail } from '@/features/admissions/admissions-api';
import { fmtDate, fmtDateTime, platformError } from '@/features/platform/common';
import { useStudentOptions } from '@/features/students/students-api';
import { admissionTone } from './admissions-list';

const today = () => new Date().toISOString().slice(0, 10);
const errBox = (m: string | null) => (m ? <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{m}</p> : null);

function Info({ label, value }: { label: string; value: string | null }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt><dd className="mt-0.5 text-sm font-medium text-navy-900">{value || '—'}</dd></div>;
}

function ApproveModal({ a, onClose }: { a: ApplicationDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const options = useStudentOptions();
  const approve = useApproveApplication(a.id);
  const [classId, setClassId] = useState(a.appliedClass.id);
  const [sectionId, setSectionId] = useState('');
  const [date, setDate] = useState(today());
  const [no, setNo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const sections = options.data?.find((c) => c.id === classId)?.sections ?? [];
  const save = async () => {
    setError(null);
    try {
      const { student } = await approve.mutateAsync({ classId, sectionId: sectionId || null, admissionDate: date, admissionNo: no.trim() || undefined });
      toast.success(t('admissions.approved'), `${student.firstName} ${student.lastName} · ${student.admissionNo}`);
      navigate(`/app/students/${student.id}`);
    } catch (e) {
      setError(platformError(t, e));
    }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('admissions.approveTitle', { name: `${a.firstName} ${a.lastName}` })} description={t('admissions.approveBody')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void save()} disabled={!classId || !date} loading={approve.isPending}>{t('admissions.approve')}</Button></>}>
      <div className="space-y-4">
        {errBox(error)}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ad-class" label={t('students.class')}><Select id="ad-class" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(''); }}>{(options.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field id="ad-sec" label={t('students.section')}><Select id="ad-sec" value={sectionId} onChange={(e) => setSectionId(e.target.value)}><option value="">{t('students.noSection')}</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field id="ad-date" label={t('students.admissionDate')}><Input id="ad-date" type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field id="ad-no" label={t('students.admissionNo')} hint={t('students.admissionNoHint')}><Input id="ad-no" dir="ltr" value={no} onChange={(e) => setNo(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function RejectModal({ a, onClose }: { a: ApplicationDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const reject = useRejectApplication(a.id);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    try { await reject.mutateAsync(note.trim()); toast.success(t('admissions.rejected')); onClose(); } catch (e) { setError(platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('admissions.rejectTitle', { name: `${a.firstName} ${a.lastName}` })} description={t('admissions.rejectBody')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => void save()} loading={reject.isPending}>{t('admissions.reject')}</Button></>}>
      <div className="space-y-4">{errBox(error)}<Field id="rj-note" label={t('students.reason')}><Input id="rj-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
    </Modal>
  );
}

export default function AdmissionDetailPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const { data: a, isLoading, error, refetch } = useApplication(id);
  const [modal, setModal] = useState<'approve' | 'reject' | null>(null);
  if (error) return <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, error)} onRetry={() => void refetch()} />;
  if (isLoading || !a) return <Skeleton className="h-64" />;
  const lang = i18n.language;
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: t('admissions.title'), to: '/app/admissions' }, { label: a.applicationNo }]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-extrabold text-navy-900">{a.firstName} {a.lastName}<Badge tone={admissionTone[a.status]}>{t(`admissions.statuses.${a.status}`)}</Badge></h1>
          <p className="mt-1 text-sm text-muted"><span dir="ltr">{a.applicationNo}</span> · {t('admissions.appliedClass')}: {a.appliedClass.name}</p>
        </div>
        {a.status === 'PENDING' && can('admission.approve') && (
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => setModal('reject')}>{t('admissions.reject')}</Button>
            <Button onClick={() => setModal('approve')}>{t('admissions.approve')}</Button>
          </div>
        )}
      </div>

      {a.status !== 'PENDING' && (
        <Card className="p-5">
          <CardHeader title={t('admissions.decision')} />
          <dl className="mt-3 grid gap-4 sm:grid-cols-3">
            <Info label={t('platform.schools.status')} value={t(`admissions.statuses.${a.status}`)} />
            <Info label={t('admissions.decidedBy')} value={a.decidedBy?.name ?? null} />
            <Info label={t('admissions.decidedAt')} value={a.decidedAt ? fmtDateTime(a.decidedAt, lang) : null} />
            {a.decisionNote && <Info label={t('students.reason')} value={a.decisionNote} />}
          </dl>
          {a.student && <p className="mt-4 text-sm"><Link to={`/app/students/${a.student.id}`} className="font-semibold text-brand-700 hover:underline">{t('admissions.openStudent', { no: a.student.admissionNo })}</Link></p>}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader title={t('admissions.applicant')} />
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Info label={t('students.gender')} value={t(`students.genders.${a.gender}`)} />
            <Info label={t('students.dob')} value={fmtDate(a.dateOfBirth, lang)} />
            <Info label={t('students.bloodGroup')} value={a.bloodGroup} />
            <Info label={t('students.previousSchool')} value={a.previousSchool} />
            <Info label={t('admissions.appliedOn')} value={fmtDate(a.applicationDate, lang)} />
            <Info label={t('platform.schools.address')} value={a.address} />
            <Info label={t('admissions.notes')} value={a.notes} />
          </dl>
        </Card>
        <Card className="p-5">
          <CardHeader title={t('admissions.guardian')} />
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Info label={t('platform.admins.name')} value={a.guardianName} />
            <Info label={t('students.relation')} value={t(`students.relations.${a.guardianRelation}`)} />
            <Info label={t('students.phone')} value={a.guardianPhone} />
            <Info label={t('platform.email')} value={a.guardianEmail} />
            <Info label={t('students.occupation')} value={a.guardianOccupation} />
          </dl>
        </Card>
      </div>
      {modal === 'approve' && <ApproveModal a={a} onClose={() => setModal(null)} />}
      {modal === 'reject' && <RejectModal a={a} onClose={() => setModal(null)} />}
    </div>
  );
}
