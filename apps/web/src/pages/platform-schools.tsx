import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { PageHeader, SchoolStatusBadge, SubscriptionBadge, fmtDate, platformError } from '@/features/platform/common';
import { useCreateSchool, usePlans, useSchools, type SchoolListItem } from '@/features/platform/platform-api';

const schema = z.object({
  name: z.string().trim().min(1, 'platform.validation.required').max(150),
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/, 'platform.validation.code'),
  city: z.string().trim().max(100).optional(),
  email: z.string().trim().email('platform.validation.email').or(z.literal('')).optional(),
  planId: z.string().uuid('platform.validation.required'),
  adminFirstName: z.string().trim().min(1, 'platform.validation.required').max(80),
  adminLastName: z.string().trim().min(1, 'platform.validation.required').max(80),
  adminEmail: z.string().trim().email('platform.validation.email'),
  adminPassword: z.string().min(10, 'platform.validation.password'),
});
type Values = z.infer<typeof schema>;

function CreateSchoolModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const plans = usePlans();
  const create = useCreateSchool();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema) });
  const err = (m?: string) => (m ? t(m) : undefined);
  const activePlans = (plans.data ?? []).filter((p) => p.isActive);

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    try {
      const { school } = await create.mutateAsync({
        name: v.name, code: v.code, city: v.city || undefined, email: v.email || undefined, planId: v.planId,
        admin: { firstName: v.adminFirstName, lastName: v.adminLastName, email: v.adminEmail, password: v.adminPassword },
      });
      toast.success(t('platform.schools.created'), school.name);
      reset();
      onOpenChange(false);
      navigate(`/app/platform/schools/${school.id}`);
    } catch (e) {
      setServerError(platformError(t, e));
    }
  });

  return (
    <Modal
      open={open}
      onOpenChange={(o) => { if (!o) { setServerError(null); reset(); } onOpenChange(o); }}
      title={t('platform.schools.addTitle')}
      description={t('platform.schools.addDesc')}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button type="submit" form="create-school" loading={create.isPending}>{t('platform.schools.create')}</Button>
        </>
      }
    >
      <form id="create-school" onSubmit={onSubmit} noValidate className="space-y-4">
        {serverError && <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{serverError}</p>}
        <Field id="cs-name" label={t('platform.schools.name')} error={err(errors.name?.message)}><Input id="cs-name" {...register('name')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="cs-code" label={t('platform.schools.code')} hint={t('platform.schools.codeHint')} error={err(errors.code?.message)}><Input id="cs-code" dir="ltr" {...register('code')} /></Field>
          <Field id="cs-city" label={t('platform.schools.city')}><Input id="cs-city" {...register('city')} /></Field>
        </div>
        <Field id="cs-email" label={t('platform.schools.email')} error={err(errors.email?.message)}><Input id="cs-email" type="email" dir="ltr" {...register('email')} /></Field>
        <Field id="cs-plan" label={t('platform.schools.plan')} error={err(errors.planId?.message)} hint={!plans.isLoading && activePlans.length === 0 ? t('platform.schools.noPlans') : undefined}>
          <Select id="cs-plan" defaultValue="" {...register('planId')}>
            <option value="" disabled>{t('platform.schools.choosePlan')}</option>
            {activePlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <fieldset className="space-y-4 rounded-control border border-line p-4">
          <legend className="px-1 text-sm font-bold text-navy-900">{t('platform.schools.firstAdmin')}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="cs-afn" label={t('platform.firstName')} error={err(errors.adminFirstName?.message)}><Input id="cs-afn" {...register('adminFirstName')} /></Field>
            <Field id="cs-aln" label={t('platform.lastName')} error={err(errors.adminLastName?.message)}><Input id="cs-aln" {...register('adminLastName')} /></Field>
          </div>
          <Field id="cs-ae" label={t('platform.email')} error={err(errors.adminEmail?.message)}><Input id="cs-ae" type="email" dir="ltr" autoComplete="off" {...register('adminEmail')} /></Field>
          <Field id="cs-ap" label={t('platform.initialPassword')} hint={t('platform.passwordHint')} error={err(errors.adminPassword?.message)}><Input id="cs-ap" type="password" autoComplete="new-password" dir="ltr" {...register('adminPassword')} /></Field>
        </fieldset>
      </form>
    </Modal>
  );
}

export default function PlatformSchoolsPage() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, error, refetch } = useSchools();
  const [open, setOpen] = useState(false);

  const columns: Column<SchoolListItem>[] = [
    { key: 'name', header: t('platform.schools.name'), sortValue: (r) => r.name, cell: (r) => (
      <Link to={`/app/platform/schools/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.name}<span className="block text-xs font-normal text-muted" dir="ltr">{r.code}</span></Link>
    ) },
    { key: 'city', header: t('platform.schools.city'), sortValue: (r) => r.city ?? '', cell: (r) => r.city ?? '—' },
    { key: 'plan', header: t('platform.schools.plan'), sortValue: (r) => r.subscription?.planName ?? '', cell: (r) => (r.subscription ? <span className="inline-flex items-center gap-2">{r.subscription.planName}<SubscriptionBadge status={r.subscription.status} t={t} /></span> : '—') },
    { key: 'users', header: t('platform.schools.users'), sortValue: (r) => r.userCount, cell: (r) => r.userCount, className: 'text-end' },
    { key: 'status', header: t('platform.schools.status'), sortValue: (r) => r.status, cell: (r) => <SchoolStatusBadge status={r.status} t={t} /> },
    { key: 'created', header: t('platform.schools.created'), sortValue: (r) => r.createdAt, cell: (r) => fmtDate(r.createdAt, i18n.language) },
  ];

  return (
    <div>
      <PageHeader
        title={t('platform.schools.title')}
        subtitle={t('platform.schools.subtitle')}
        action={<Button onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden />{t('platform.schools.add')}</Button>}
      />
      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.id}
        searchText={(r) => `${r.name} ${r.code} ${r.city ?? ''}`}
        loading={isLoading}
        error={error ? platformError(t, error) : null}
        onRetry={() => void refetch()}
        emptyTitle={t('platform.schools.emptyTitle')}
        emptyDescription={t('platform.schools.emptyBody')}
      />
      <CreateSchoolModal open={open} onOpenChange={setOpen} />
    </div>
  );
}
