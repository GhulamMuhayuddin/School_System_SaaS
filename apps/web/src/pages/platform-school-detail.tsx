import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { SchoolStatusBadge, SubscriptionBadge, fmtDate, fmtDateTime, platformError } from '@/features/platform/common';
import {
  SUBSCRIPTION_STATUSES, usePlans, useSchool, useSetSchoolStatus, useSetSubscription, useUpdateSchool,
  type SchoolDetail, type SubscriptionStatus,
} from '@/features/platform/platform-api';

const editSchema = z.object({
  name: z.string().trim().min(1, 'platform.validation.required').max(150),
  email: z.string().trim().email('platform.validation.email').or(z.literal('')),
  phone: z.string().trim().max(40),
  city: z.string().trim().max(100),
  address: z.string().trim().max(300),
});
type EditValues = z.infer<typeof editSchema>;

function EditModal({ school, open, onOpenChange }: { school: SchoolDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const update = useUpdateSchool(school.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: school.name, email: school.email ?? '', phone: school.phone ?? '', city: school.city ?? '', address: school.address ?? '' },
  });
  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    try {
      await update.mutateAsync({ name: v.name, email: v.email, phone: v.phone || null, city: v.city || null, address: v.address || null } as never);
      toast.success(t('platform.detail.saved'));
      onOpenChange(false);
    } catch (e) {
      setServerError(platformError(t, e));
    }
  });
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t('platform.detail.editTitle')}
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button><Button type="submit" form="edit-school" loading={update.isPending}>{t('platform.save')}</Button></>}>
      <form id="edit-school" onSubmit={onSubmit} noValidate className="space-y-4">
        {serverError && <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{serverError}</p>}
        <Field id="es-name" label={t('platform.schools.name')} error={errors.name?.message && t(errors.name.message)}><Input id="es-name" {...register('name')} /></Field>
        <Field id="es-email" label={t('platform.schools.email')} error={errors.email?.message && t(errors.email.message)}><Input id="es-email" type="email" dir="ltr" {...register('email')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="es-phone" label={t('platform.schools.phone')}><Input id="es-phone" dir="ltr" {...register('phone')} /></Field>
          <Field id="es-city" label={t('platform.schools.city')}><Input id="es-city" {...register('city')} /></Field>
        </div>
        <Field id="es-address" label={t('platform.schools.address')}><Input id="es-address" {...register('address')} /></Field>
      </form>
    </Modal>
  );
}

function SubscriptionModal({ school, open, onOpenChange }: { school: SchoolDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const plans = usePlans();
  const setSub = useSetSubscription(school.id);
  const [planId, setPlanId] = useState(school.subscription?.planId ?? '');
  const [status, setStatus] = useState<SubscriptionStatus>(school.subscription?.status ?? 'TRIAL');
  const [endsAt, setEndsAt] = useState(school.subscription?.endsAt?.slice(0, 10) ?? '');
  const [serverError, setServerError] = useState<string | null>(null);

  const save = async () => {
    setServerError(null);
    try {
      await setSub.mutateAsync({ planId, status, endsAt: endsAt || null });
      toast.success(t('platform.detail.subSaved'));
      onOpenChange(false);
    } catch (e) {
      setServerError(platformError(t, e));
    }
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t('platform.detail.subTitle')} description={t('platform.detail.subDesc')}
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button><Button onClick={() => void save()} disabled={!planId} loading={setSub.isPending}>{t('platform.save')}</Button></>}>
      <div className="space-y-4">
        {serverError && <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{serverError}</p>}
        <Field id="sub-plan" label={t('platform.schools.plan')}>
          <Select id="sub-plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="" disabled>{t('platform.schools.choosePlan')}</option>
            {(plans.data ?? []).filter((p) => p.isActive || p.id === school.subscription?.planId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field id="sub-status" label={t('platform.schools.status')}>
          <Select id="sub-status" value={status} onChange={(e) => setStatus(e.target.value as SubscriptionStatus)}>
            {SUBSCRIPTION_STATUSES.map((s) => <option key={s} value={s}>{t(`platform.subStatus.${s}`)}</option>)}
          </Select>
        </Field>
        <Field id="sub-end" label={t('platform.detail.endsAt')} hint={t('platform.detail.endsAtHint')}>
          <Input id="sub-end" type="date" dir="ltr" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-navy-900">{value === null || value === '' ? '—' : value}</dd>
    </div>
  );
}

export default function PlatformSchoolDetailPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { data: school, isLoading, error, refetch } = useSchool(id);
  const setStatus = useSetSchoolStatus(id);
  const [edit, setEdit] = useState(false);
  const [sub, setSub] = useState(false);
  const [confirm, setConfirm] = useState(false);

  if (error) return <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, error)} onRetry={() => void refetch()} />;
  if (isLoading || !school) return <Skeleton className="h-64" />;

  const suspended = school.status === 'SUSPENDED';
  const toggle = async () => {
    try {
      await setStatus.mutateAsync(suspended ? 'ACTIVE' : 'SUSPENDED');
      toast.success(t(suspended ? 'platform.detail.activated' : 'platform.detail.suspendedDone'));
      setConfirm(false);
    } catch (e) {
      toast.error(t('platform.errors.generic'), platformError(t, e));
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: t('platform.schools.title'), to: '/app/platform/schools' }, { label: school.name }]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-extrabold text-navy-900">{school.name}<SchoolStatusBadge status={school.status} t={t} /></h1>
          <p className="mt-1 text-sm text-muted" dir="ltr">{school.code}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEdit(true)}>{t('platform.detail.edit')}</Button>
          <Button variant={suspended ? 'primary' : 'danger'} onClick={() => setConfirm(true)}>{suspended ? t('platform.detail.activate') : t('platform.detail.suspend')}</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <CardHeader title={t('platform.detail.profile')} />
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Info label={t('platform.schools.email')} value={school.email} />
            <Info label={t('platform.schools.phone')} value={school.phone} />
            <Info label={t('platform.schools.city')} value={school.city} />
            <Info label={t('platform.schools.address')} value={school.address} />
            <Info label={t('platform.detail.timezone')} value={school.timezone} />
            <Info label={t('platform.schools.created')} value={fmtDate(school.createdAt, i18n.language)} />
          </dl>
        </Card>
        <Card className="p-5">
          <CardHeader title={t('platform.detail.usage')} />
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <Info label={t('platform.schools.users')} value={school.counts.users} />
            <Info label={t('platform.detail.classes')} value={school.counts.classes} />
            <Info label={t('platform.detail.sections')} value={school.counts.sections} />
            <Info label={t('platform.detail.subjects')} value={school.counts.subjects} />
          </dl>
        </Card>
      </div>

      <Card className="p-5">
        <CardHeader title={t('platform.detail.subscription')} action={<Button size="sm" variant="secondary" onClick={() => setSub(true)}>{t('platform.detail.changeSub')}</Button>} />
        {school.subscription ? (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <strong className="text-navy-900">{school.subscription.planName}</strong>
            <SubscriptionBadge status={school.subscription.status} t={t} />
            <span className="text-muted">{t('platform.detail.until', { date: fmtDate(school.subscription.endsAt, i18n.language) })}</span>
          </p>
        ) : <p className="mt-3 text-sm text-muted">{t('platform.detail.noSub')}</p>}
        {school.subscriptions.length > 1 && (
          <ul className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm text-muted">
            {school.subscriptions.slice(1).map((s) => (
              <li key={s.id}>{s.planName} · {t(`platform.subStatus.${s.status}`)} · {fmtDate(s.startsAt, i18n.language)}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <CardHeader title={t('platform.detail.admins')} />
        {school.admins.length === 0 ? <p className="mt-3 text-sm text-muted">{t('platform.detail.noAdmins')}</p> : (
          <ul className="mt-3 divide-y divide-line/70">
            {school.admins.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span><strong className="text-navy-900">{a.firstName} {a.lastName}</strong><span className="ms-2 text-muted" dir="ltr">{a.email}</span></span>
                <span className="flex items-center gap-3 text-xs text-muted">
                  {a.lastLoginAt ? t('platform.lastLogin', { date: fmtDateTime(a.lastLoginAt, i18n.language) }) : t('platform.neverLoggedIn')}
                  <Badge tone={a.status === 'ACTIVE' ? 'success' : 'neutral'}>{t(`platform.userStatus.${a.status}`)}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {edit && <EditModal school={school} open onOpenChange={setEdit} />}
      {sub && <SubscriptionModal school={school} open onOpenChange={setSub} />}
      <ConfirmDialog
        open={confirm} onOpenChange={setConfirm} danger={!suspended} loading={setStatus.isPending}
        title={t(suspended ? 'platform.detail.activateTitle' : 'platform.detail.suspendTitle', { name: school.name })}
        description={t(suspended ? 'platform.detail.activateBody' : 'platform.detail.suspendBody')}
        confirmLabel={suspended ? t('platform.detail.activate') : t('platform.detail.suspend')}
        onConfirm={toggle}
      />
    </div>
  );
}
