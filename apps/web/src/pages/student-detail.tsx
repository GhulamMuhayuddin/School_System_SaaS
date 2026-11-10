import { useState } from 'react';
import { Star, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { StudentAttendanceCard } from '@/features/attendance/student-attendance-card';
import { StudentFeeCard } from '@/features/fees/student-fee-card';
import { StudentHostelCard } from '@/features/hostel/student-hostel-card';
import { StudentTransportCard } from '@/features/transport/student-transport-card';
import { fmtDate, platformError } from '@/features/platform/common';
import {
  GENDERS, RELATIONS, useAddGuardian, useDeleteStudent, useReinstateStudent, useRemoveGuardian, useStudent, useStudentOptions,
  useCreateGuardianAccount, useCreateStudentAccount, useUpdateGuardian, useUpdateStudent, useWithdrawStudent, type Gender, type GuardianRelation, type StudentDetail,
} from '@/features/students/students-api';

const today = () => new Date().toISOString().slice(0, 10);
const statusTone = { ACTIVE: 'success', WITHDRAWN: 'neutral', TRANSFERRED: 'warning', GRADUATED: 'brand' } as const;
const err = (m: string | null) => (m ? <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{m}</p> : null);

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-navy-900">{value || '—'}</dd>
    </div>
  );
}

function EditModal({ s, onClose }: { s: StudentDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const options = useStudentOptions();
  const update = useUpdateStudent(s.id);
  const [v, setV] = useState({
    firstName: s.firstName, lastName: s.lastName, gender: s.gender as Gender, dateOfBirth: s.dateOfBirth, bloodGroup: s.bloodGroup ?? '',
    phone: s.phone ?? '', address: s.address ?? '', previousSchool: s.previousSchool ?? '', admissionDate: s.admissionDate,
    classId: s.class.id, sectionId: s.section?.id ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value, ...(k === 'classId' ? { sectionId: '' } : {}) }));
  const sections = options.data?.find((c) => c.id === v.classId)?.sections ?? [];
  const valid = v.firstName.trim() && v.lastName.trim() && v.dateOfBirth && v.dateOfBirth < today() && v.admissionDate;
  const save = async () => {
    setError(null);
    try {
      await update.mutateAsync({
        firstName: v.firstName.trim(), lastName: v.lastName.trim(), gender: v.gender, dateOfBirth: v.dateOfBirth, bloodGroup: v.bloodGroup.trim() || null,
        phone: v.phone.trim(), address: v.address.trim() || null, previousSchool: v.previousSchool.trim() || null, admissionDate: v.admissionDate,
        classId: v.classId, sectionId: v.sectionId || null,
      });
      toast.success(t('platform.detail.saved'));
      onClose();
    } catch (e) {
      setError(platformError(t, e));
    }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('students.editTitle')} description={`${s.admissionNo}`}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void save()} disabled={!valid} loading={update.isPending}>{t('platform.save')}</Button></>}>
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pe-1">
        {err(error)}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="e-fn" label={t('platform.firstName')}><Input id="e-fn" value={v.firstName} onChange={set('firstName')} /></Field>
          <Field id="e-ln" label={t('platform.lastName')}><Input id="e-ln" value={v.lastName} onChange={set('lastName')} /></Field>
          <Field id="e-g" label={t('students.gender')}><Select id="e-g" value={v.gender} onChange={set('gender')}>{GENDERS.map((g) => <option key={g} value={g}>{t(`students.genders.${g}`)}</option>)}</Select></Field>
          <Field id="e-dob" label={t('students.dob')}><Input id="e-dob" type="date" dir="ltr" value={v.dateOfBirth} onChange={set('dateOfBirth')} /></Field>
          <Field id="e-class" label={t('students.class')}><Select id="e-class" value={v.classId} onChange={set('classId')}>{(options.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field id="e-sec" label={t('students.section')}><Select id="e-sec" value={v.sectionId} onChange={set('sectionId')}><option value="">{t('students.noSection')}</option>{sections.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
          <Field id="e-blood" label={t('students.bloodGroup')}><Input id="e-blood" dir="ltr" value={v.bloodGroup} onChange={set('bloodGroup')} /></Field>
          <Field id="e-phone" label={t('students.phone')}><Input id="e-phone" dir="ltr" value={v.phone} onChange={set('phone')} /></Field>
          <Field id="e-adate" label={t('students.admissionDate')}><Input id="e-adate" type="date" dir="ltr" value={v.admissionDate} onChange={set('admissionDate')} /></Field>
          <Field id="e-prev" label={t('students.previousSchool')}><Input id="e-prev" value={v.previousSchool} onChange={set('previousSchool')} /></Field>
        </div>
        <Field id="e-addr" label={t('platform.schools.address')}><Input id="e-addr" value={v.address} onChange={set('address')} /></Field>
      </div>
    </Modal>
  );
}

function GuardianModal({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const add = useAddGuardian(studentId);
  const [v, setV] = useState({ name: '', phone: '', email: '', occupation: '', relation: 'MOTHER' as GuardianRelation });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));
  const valid = v.name.trim() && /^[0-9+\-()\s]{6,25}$/.test(v.phone.trim());
  const save = async () => {
    setError(null);
    try {
      await add.mutateAsync({ name: v.name.trim(), phone: v.phone.trim(), email: v.email.trim() || undefined, occupation: v.occupation.trim() || undefined, relation: v.relation });
      toast.success(t('students.guardianAdded'));
      onClose();
    } catch (e) {
      setError(platformError(t, e));
    }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('students.addGuardian')} description={t('students.guardianNote')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void save()} disabled={!valid} loading={add.isPending}>{t('platform.save')}</Button></>}>
      <div className="space-y-4">
        {err(error)}
        <Field id="ag-name" label={t('platform.admins.name')}><Input id="ag-name" value={v.name} onChange={set('name')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ag-rel" label={t('students.relation')}><Select id="ag-rel" value={v.relation} onChange={set('relation')}>{RELATIONS.map((r) => <option key={r} value={r}>{t(`students.relations.${r}`)}</option>)}</Select></Field>
          <Field id="ag-phone" label={t('students.phone')}><Input id="ag-phone" dir="ltr" value={v.phone} onChange={set('phone')} /></Field>
          <Field id="ag-email" label={t('platform.email')}><Input id="ag-email" type="email" dir="ltr" value={v.email} onChange={set('email')} /></Field>
          <Field id="ag-occ" label={t('students.occupation')}><Input id="ag-occ" value={v.occupation} onChange={set('occupation')} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function StudentLoginModal({ s, onClose }: { s: StudentDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateStudentAccount(s.id);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const valid = /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= 10;
  const save = async () => {
    setError(null);
    try {
      await create.mutateAsync({ email: email.trim(), password });
      toast.success(t('students.studentLoginCreated'));
      onClose();
    } catch (e) {
      setError(platformError(t, e));
    }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('students.studentLoginTitle', { name: s.firstName })} description={t('students.studentLoginBody')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void save()} disabled={!valid} loading={create.isPending}>{t('students.createStudentLogin')}</Button></>}>
      <div className="space-y-4">
        {err(error)}
        <Field id="sl-email" label={t('platform.email')}><Input id="sl-email" type="email" dir="ltr" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field id="sl-pw" label={t('platform.initialPassword')} hint={t('platform.passwordHint')}><Input id="sl-pw" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function AccountModal({ studentId, g, onClose }: { studentId: string; g: StudentDetail['guardians'][number]; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateGuardianAccount(studentId);
  const [email, setEmail] = useState(g.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const valid = /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= 10;
  const save = async () => {
    setError(null);
    try {
      await create.mutateAsync({ guardianId: g.guardianId, email: email.trim(), password });
      toast.success(t('students.accountCreated'));
      onClose();
    } catch (e) {
      setError(platformError(t, e));
    }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('students.accountTitle', { name: g.name })} description={t('students.accountBody')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void save()} disabled={!valid} loading={create.isPending}>{t('students.createAccount')}</Button></>}>
      <div className="space-y-4">
        {err(error)}
        <Field id="pa-email" label={t('platform.email')}><Input id="pa-email" type="email" dir="ltr" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field id="pa-pw" label={t('platform.initialPassword')} hint={t('platform.passwordHint')}><Input id="pa-pw" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function WithdrawModal({ s, onClose }: { s: StudentDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const withdraw = useWithdrawStudent(s.id);
  const [status, setStatus] = useState<'WITHDRAWN' | 'TRANSFERRED' | 'GRADUATED'>('WITHDRAWN');
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    try {
      await withdraw.mutateAsync({ status, date, reason: reason.trim() || undefined });
      toast.success(t('students.leftDone'));
      onClose();
    } catch (e) {
      setError(platformError(t, e));
    }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('students.leaveTitle', { name: `${s.firstName} ${s.lastName}` })} description={t('students.leaveBody')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => void save()} disabled={!date} loading={withdraw.isPending}>{t('students.confirmLeave')}</Button></>}>
      <div className="space-y-4">
        {err(error)}
        <Field id="w-status" label={t('platform.schools.status')}>
          <Select id="w-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            {(['WITHDRAWN', 'TRANSFERRED', 'GRADUATED'] as const).map((x) => <option key={x} value={x}>{t(`students.statuses.${x}`)}</option>)}
          </Select>
        </Field>
        <Field id="w-date" label={t('students.leftOn')}><Input id="w-date" type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field id="w-reason" label={t('students.reason')}><Input id="w-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export default function StudentDetailPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { data: s, isLoading, error, refetch } = useStudent(id);
  const reinstate = useReinstateStudent(id);
  const remove = useDeleteStudent(id);
  const updateGuardian = useUpdateGuardian(id);
  const removeGuardian = useRemoveGuardian(id);
  const [modal, setModal] = useState<'edit' | 'guardian' | 'leave' | 'delete' | 'login' | null>(null);
  const [accountFor, setAccountFor] = useState<StudentDetail['guardians'][number] | null>(null);

  if (error) return <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, error)} onRetry={() => void refetch()} />;
  if (isLoading || !s) return <Skeleton className="h-64" />;
  const canEdit = can('student.update');
  const fail = (e: unknown) => toast.error(t('platform.errors.generic'), platformError(t, e));

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: t('students.title'), to: '/app/students' }, { label: `${s.firstName} ${s.lastName}` }]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-extrabold text-navy-900">{s.firstName} {s.lastName}<Badge tone={statusTone[s.status]}>{t(`students.statuses.${s.status}`)}</Badge>{s.hasAccount && <Badge tone="success">{t('students.studentHasLogin')}</Badge>}</h1>
          <p className="mt-1 text-sm text-muted"><span dir="ltr">{s.admissionNo}</span> · {s.class.name}{s.section ? ` – ${s.section.name}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <Button variant="secondary" onClick={() => setModal('edit')}>{t('platform.detail.edit')}</Button>}
          {can('student.withdraw') && (s.status === 'ACTIVE'
            ? <Button variant="secondary" onClick={() => setModal('leave')}>{t('students.markLeft')}</Button>
            : <Button variant="secondary" loading={reinstate.isPending} onClick={() => reinstate.mutateAsync().then(() => toast.success(t('students.reinstated'))).catch(fail)}>{t('students.reinstate')}</Button>)}
          {can('school.role.manage') && s.status === 'ACTIVE' && !s.hasAccount && <Button variant="secondary" onClick={() => setModal('login')}>{t('students.createStudentLogin')}</Button>}
          {can('student.delete') && <Button variant="danger" onClick={() => setModal('delete')}>{t('students.delete')}</Button>}
        </div>
      </div>

      <Card className="p-5">
        <CardHeader title={t('students.personal')} />
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info label={t('students.gender')} value={t(`students.genders.${s.gender}`)} />
          <Info label={t('students.dob')} value={fmtDate(s.dateOfBirth, i18n.language)} />
          <Info label={t('students.bloodGroup')} value={s.bloodGroup} />
          <Info label={t('students.phone')} value={s.phone} />
          <Info label={t('students.admissionDate')} value={fmtDate(s.admissionDate, i18n.language)} />
          <Info label={t('students.previousSchool')} value={s.previousSchool} />
          <Info label={t('platform.schools.address')} value={s.address} />
          {s.leftAt && <Info label={t('students.leftOn')} value={`${fmtDate(s.leftAt, i18n.language)}${s.leftReason ? ` · ${s.leftReason}` : ''}`} />}
        </dl>
      </Card>

      <Card className="p-5">
        <CardHeader title={t('students.guardians')} action={canEdit ? <Button size="sm" variant="secondary" onClick={() => setModal('guardian')}>{t('students.addGuardian')}</Button> : undefined} />
        <ul className="mt-3 divide-y divide-line/70">
          {s.guardians.map((g) => (
            <li key={g.linkId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="flex items-center gap-2 font-bold text-navy-900">{g.name}<Badge tone="neutral">{t(`students.relations.${g.relation}`)}</Badge>{g.hasAccount && <Badge tone="success">{t('students.hasAccount')}</Badge>}{g.isPrimary && <Badge tone="brand"><Star className="me-1 size-3" aria-hidden />{t('students.primary')}</Badge>}</p>
                <p className="mt-0.5 text-muted"><span dir="ltr">{g.phone}</span>{g.email ? <> · <span dir="ltr">{g.email}</span></> : null}{g.occupation ? ` · ${g.occupation}` : ''}</p>
              </div>
              {(canEdit || can('school.role.manage')) && (
                <div className="flex gap-1">
                  {!g.hasAccount && can('school.role.manage') && <Button size="sm" variant="ghost" onClick={() => setAccountFor(g)}>{t('students.createAccount')}</Button>}
                  {canEdit && !g.isPrimary && <Button size="sm" variant="ghost" onClick={() => updateGuardian.mutateAsync({ linkId: g.linkId, isPrimary: true }).catch(fail)}>{t('students.makePrimary')}</Button>}
                  {canEdit && s.guardians.length > 1 && <Button size="sm" variant="ghost" aria-label={t('students.removeGuardian')} onClick={() => removeGuardian.mutateAsync(g.linkId).catch(fail)}><Trash2 className="size-4 text-rose-600" aria-hidden /></Button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {can('attendance.read') && <StudentAttendanceCard studentId={s.id} />}
      {can('fee.read') && <StudentFeeCard studentId={s.id} />}
      {can('transport.read') && <StudentTransportCard studentId={s.id} studentName={`${s.firstName} ${s.lastName}`} />}
      {can('hostel.read') && <StudentHostelCard studentId={s.id} studentName={`${s.firstName} ${s.lastName}`} />}

      {s.siblings.length > 0 && (
        <Card className="p-5">
          <CardHeader title={t('students.siblings')} description={t('students.siblingsNote')} />
          <ul className="mt-3 space-y-1.5 text-sm">
            {s.siblings.map((x) => <li key={x.id}><Link to={`/app/students/${x.id}`} className="font-semibold text-brand-700 hover:underline">{x.firstName} {x.lastName}</Link><span className="text-muted"> · {x.class} · <span dir="ltr">{x.admissionNo}</span></span></li>)}
          </ul>
        </Card>
      )}

      {modal === 'login' && <StudentLoginModal s={s} onClose={() => setModal(null)} />}
      {accountFor && <AccountModal studentId={s.id} g={accountFor} onClose={() => setAccountFor(null)} />}
      {modal === 'edit' && <EditModal s={s} onClose={() => setModal(null)} />}
      {modal === 'guardian' && <GuardianModal studentId={s.id} onClose={() => setModal(null)} />}
      {modal === 'leave' && <WithdrawModal s={s} onClose={() => setModal(null)} />}
      <ConfirmDialog open={modal === 'delete'} onOpenChange={(o) => !o && setModal(null)} danger loading={remove.isPending}
        title={t('students.deleteTitle', { name: `${s.firstName} ${s.lastName}` })} description={t('students.deleteBody')} confirmLabel={t('students.delete')}
        onConfirm={() => remove.mutateAsync().then(() => { toast.success(t('students.deleted')); navigate('/app/students'); }).catch(fail)} />
    </div>
  );
}
