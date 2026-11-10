import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { fmtDate, platformError } from '@/features/platform/common';
import { useRoleOptions } from '@/features/school/school-api';
import {
  CATEGORIES, useCreateStaffAccount, useDeleteStaff, useLeaveStaff, useReinstateStaff, useStaffMember, useUpdateStaff, type StaffCategory, type StaffDetail,
} from '@/features/staff/staff-api';
import { GENDERS, type Gender } from '@/features/students/students-api';

const today = () => new Date().toISOString().slice(0, 10);
const err = (m: string | null) => (m ? <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{m}</p> : null);
const roleName = (t: TFunction, r: { key: string; name: string }) => t(`roles.${r.key}`, { defaultValue: r.name });

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-navy-900">{value || '—'}</dd>
    </div>
  );
}

function EditModal({ s, onClose }: { s: StaffDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const update = useUpdateStaff(s.id);
  const [v, setV] = useState({
    firstName: s.firstName, lastName: s.lastName, gender: s.gender as Gender, dateOfBirth: s.dateOfBirth ?? '', phone: s.phone, email: s.email ?? '', cnic: s.cnic ?? '',
    address: s.address ?? '', category: s.category as StaffCategory, designation: s.designation, qualification: s.qualification ?? '', joiningDate: s.joiningDate, notes: s.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));
  const valid = v.firstName.trim() && v.lastName.trim() && v.phone.trim().length >= 6 && v.designation.trim() && v.joiningDate;
  const save = async () => {
    setError(null);
    try {
      await update.mutateAsync({ ...v, dateOfBirth: v.dateOfBirth || null });
      toast.success(t('staff.updated'));
      onClose();
    } catch (e) {
      setError(platformError(t, e));
    }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('staff.editTitle')} description={s.employeeNo}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void save()} disabled={!valid} loading={update.isPending}>{t('platform.save')}</Button></>}>
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pe-1">
        {err(error)}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="se-fn" label={t('platform.firstName')}><Input id="se-fn" value={v.firstName} onChange={set('firstName')} /></Field>
          <Field id="se-ln" label={t('platform.lastName')}><Input id="se-ln" value={v.lastName} onChange={set('lastName')} /></Field>
          <Field id="se-g" label={t('students.gender')}><Select id="se-g" value={v.gender} onChange={set('gender')}>{GENDERS.map((g) => <option key={g} value={g}>{t(`students.genders.${g}`)}</option>)}</Select></Field>
          <Field id="se-dob" label={t('students.dob')}><Input id="se-dob" type="date" dir="ltr" value={v.dateOfBirth} onChange={set('dateOfBirth')} /></Field>
          <Field id="se-phone" label={t('students.phone')}><Input id="se-phone" dir="ltr" value={v.phone} onChange={set('phone')} /></Field>
          <Field id="se-email" label={t('platform.email')}><Input id="se-email" type="email" dir="ltr" value={v.email} onChange={set('email')} /></Field>
          <Field id="se-cnic" label={t('staff.cnic')}><Input id="se-cnic" dir="ltr" value={v.cnic} onChange={set('cnic')} /></Field>
          <Field id="se-qual" label={t('staff.qualification')}><Input id="se-qual" value={v.qualification} onChange={set('qualification')} /></Field>
          <Field id="se-cat" label={t('staff.category')}><Select id="se-cat" value={v.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`staff.categories.${c}`)}</option>)}</Select></Field>
          <Field id="se-des" label={t('staff.designation')}><Input id="se-des" value={v.designation} onChange={set('designation')} /></Field>
          <Field id="se-join" label={t('staff.joiningDate')}><Input id="se-join" type="date" dir="ltr" value={v.joiningDate} onChange={set('joiningDate')} /></Field>
        </div>
        <Field id="se-addr" label={t('platform.schools.address')}><Input id="se-addr" value={v.address} onChange={set('address')} /></Field>
        <Field id="se-notes" label={t('admissions.notes')}><Input id="se-notes" value={v.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

function LeaveModal({ s, onClose }: { s: StaffDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const leave = useLeaveStaff(s.id);
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    try {
      await leave.mutateAsync({ date, reason: reason.trim() || undefined });
      toast.success(t('staff.leftDone'));
      onClose();
    } catch (e) {
      setError(platformError(t, e));
    }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('staff.leaveTitle', { name: `${s.firstName} ${s.lastName}` })} description={s.hasAccount ? t('staff.leaveBodyLogin') : t('staff.leaveBody')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => void save()} disabled={!date} loading={leave.isPending}>{t('staff.markLeft')}</Button></>}>
      <div className="space-y-4">
        {err(error)}
        <Field id="sl-date" label={t('students.leftOn')}><Input id="sl-date" type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field id="sl-reason" label={t('students.reason')}><Input id="sl-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function AccountModal({ s, onClose }: { s: StaffDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateStaffAccount(s.id);
  const roles = useRoleOptions();
  const choices = (roles.data ?? []).filter((r) => !['super_admin', 'parent', 'student'].includes(r.key));
  const [email, setEmail] = useState(s.email ?? '');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const valid = /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= 10 && roleId !== '';
  const save = async () => {
    setError(null);
    try {
      await create.mutateAsync({ email: email.trim(), password, roleId });
      toast.success(t('staff.accountCreated'));
      onClose();
    } catch (e) {
      setError(platformError(t, e));
    }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('staff.accountTitle', { name: `${s.firstName} ${s.lastName}` })} description={t('staff.accountBody')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void save()} disabled={!valid} loading={create.isPending}>{t('staff.createLogin')}</Button></>}>
      <div className="space-y-4">
        {err(error)}
        <Field id="sa-email" label={t('platform.email')}><Input id="sa-email" type="email" dir="ltr" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field id="sa-role" label={t('schoolAdmin.users.role')}>
          <Select id="sa-role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="" disabled>{t('staff.chooseRole')}</option>
            {choices.map((r) => <option key={r.id} value={r.id}>{roleName(t, r)}</option>)}
          </Select>
        </Field>
        <Field id="sa-pw" label={t('platform.initialPassword')} hint={t('platform.passwordHint')}><Input id="sa-pw" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export default function StaffDetailPage() {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: s, isLoading, error, refetch } = useStaffMember(id);
  const reinstate = useReinstateStaff(id);
  const remove = useDeleteStaff(id);
  const [modal, setModal] = useState<'edit' | 'leave' | 'delete' | 'account' | null>(null);

  if (error) return <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, error)} onRetry={() => void refetch()} />;
  if (isLoading || !s) return <Skeleton className="h-64" />;
  const fail = (e: unknown) => toast.error(t('platform.errors.generic'), platformError(t, e));

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: t('staff.title'), to: '/app/staff' }, { label: `${s.firstName} ${s.lastName}` }]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-extrabold text-navy-900">{s.firstName} {s.lastName}<Badge tone={s.status === 'ACTIVE' ? 'success' : 'neutral'}>{t(`staff.statuses.${s.status}`)}</Badge></h1>
          <p className="mt-1 text-sm text-muted"><span dir="ltr">{s.employeeNo}</span> · {s.designation} · {t(`staff.categories.${s.category}`)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('staff.update') && <Button variant="secondary" onClick={() => setModal('edit')}>{t('platform.detail.edit')}</Button>}
          {can('staff.update') && (s.status === 'ACTIVE'
            ? <Button variant="secondary" onClick={() => setModal('leave')}>{t('staff.markLeft')}</Button>
            : <Button variant="secondary" loading={reinstate.isPending} onClick={() => reinstate.mutateAsync().then(() => toast.success(t('staff.reinstated'))).catch(fail)}>{t('staff.reinstate')}</Button>)}
          {can('staff.delete') && <Button variant="danger" onClick={() => setModal('delete')}>{t('staff.delete')}</Button>}
        </div>
      </div>

      <Card className="p-5">
        <CardHeader title={t('staff.personal')} />
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info label={t('students.gender')} value={t(`students.genders.${s.gender}`)} />
          <Info label={t('students.dob')} value={s.dateOfBirth ? fmtDate(s.dateOfBirth, i18n.language) : null} />
          <Info label={t('students.phone')} value={s.phone} />
          <Info label={t('platform.email')} value={s.email} />
          <Info label={t('staff.cnic')} value={s.cnic} />
          <Info label={t('staff.qualification')} value={s.qualification} />
          <Info label={t('platform.schools.address')} value={s.address} />
          <Info label={t('staff.joiningDate')} value={fmtDate(s.joiningDate, i18n.language)} />
          {s.leftAt && <Info label={t('students.leftOn')} value={`${fmtDate(s.leftAt, i18n.language)}${s.leftReason ? ` · ${s.leftReason}` : ''}`} />}
        </dl>
      </Card>

      <Card className="p-5">
        <CardHeader title={t('staff.login')} description={t('staff.loginNote')}
          action={!s.account && s.status === 'ACTIVE' && can('school.role.manage') ? <Button size="sm" variant="secondary" onClick={() => setModal('account')}>{t('staff.createLogin')}</Button> : undefined} />
        <p className="mt-3 text-sm">{s.account ? <><span dir="ltr" className="font-semibold text-navy-900">{s.account.email}</span><span className="text-muted"> · {s.account.role}</span></> : <span className="text-muted">{t('staff.noLogin')}</span>}</p>
      </Card>

      {modal === 'edit' && <EditModal s={s} onClose={() => setModal(null)} />}
      {modal === 'leave' && <LeaveModal s={s} onClose={() => setModal(null)} />}
      {modal === 'account' && <AccountModal s={s} onClose={() => setModal(null)} />}
      <ConfirmDialog open={modal === 'delete'} onOpenChange={(o) => !o && setModal(null)} danger loading={remove.isPending}
        title={t('staff.deleteTitle', { name: `${s.firstName} ${s.lastName}` })} description={t('staff.deleteBody')} confirmLabel={t('staff.delete')}
        onConfirm={() => remove.mutateAsync().then(() => { toast.success(t('staff.deleted')); navigate('/app/staff'); }).catch(fail)} />
    </div>
  );
}
