import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { PageHeader, fmtDateTime, platformError } from '@/features/platform/common';
import { useCreatePlatformAdmin, usePlatformAdmins, useSetPlatformAdminStatus, type PlatformAdmin } from '@/features/platform/platform-api';

const schema = z.object({
  firstName: z.string().trim().min(1, 'platform.validation.required').max(80),
  lastName: z.string().trim().min(1, 'platform.validation.required').max(80),
  email: z.string().trim().email('platform.validation.email'),
  password: z.string().min(10, 'platform.validation.password'),
});
type Values = z.infer<typeof schema>;

function AddModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreatePlatformAdmin();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema) });
  const e = (m?: string) => (m ? t(m) : undefined);
  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    try {
      await create.mutateAsync(v);
      toast.success(t('platform.admins.created'));
      onClose();
    } catch (err) {
      setServerError(platformError(t, err));
    }
  });
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('platform.admins.addTitle')} description={t('platform.admins.addDesc')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="add-admin" loading={create.isPending}>{t('platform.admins.add')}</Button></>}>
      <form id="add-admin" onSubmit={onSubmit} noValidate className="space-y-4">
        {serverError && <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{serverError}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="pa-fn" label={t('platform.firstName')} error={e(errors.firstName?.message)}><Input id="pa-fn" {...register('firstName')} /></Field>
          <Field id="pa-ln" label={t('platform.lastName')} error={e(errors.lastName?.message)}><Input id="pa-ln" {...register('lastName')} /></Field>
        </div>
        <Field id="pa-email" label={t('platform.email')} error={e(errors.email?.message)}><Input id="pa-email" type="email" dir="ltr" autoComplete="off" {...register('email')} /></Field>
        <Field id="pa-pw" label={t('platform.initialPassword')} hint={t('platform.passwordHint')} error={e(errors.password?.message)}><Input id="pa-pw" type="password" dir="ltr" autoComplete="new-password" {...register('password')} /></Field>
      </form>
    </Modal>
  );
}

export default function PlatformAdminsPage() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = usePlatformAdmins();
  const setStatus = useSetPlatformAdminStatus();
  const [adding, setAdding] = useState(false);

  const toggle = async (a: PlatformAdmin) => {
    try {
      await setStatus.mutateAsync({ id: a.id, status: a.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
    } catch (err) {
      toast.error(t('platform.errors.generic'), platformError(t, err));
    }
  };
  const columns: Column<PlatformAdmin>[] = [
    { key: 'name', header: t('platform.admins.name'), sortValue: (r) => `${r.firstName} ${r.lastName}`, cell: (r) => <span className="font-semibold">{r.firstName} {r.lastName}{r.id === user?.id && <Badge tone="brand" className="ms-2">{t('platform.admins.you')}</Badge>}</span> },
    { key: 'email', header: t('platform.email'), sortValue: (r) => r.email, cell: (r) => <span dir="ltr">{r.email}</span> },
    { key: 'login', header: t('platform.admins.lastLogin'), sortValue: (r) => r.lastLoginAt ?? '', cell: (r) => (r.lastLoginAt ? fmtDateTime(r.lastLoginAt, i18n.language) : t('platform.neverLoggedIn')) },
    { key: 'status', header: t('platform.schools.status'), cell: (r) => <Badge tone={r.status === 'ACTIVE' ? 'success' : 'neutral'}>{t(`platform.userStatus.${r.status}`)}</Badge> },
    { key: 'action', header: '', cell: (r) => (r.id === user?.id ? null : <Button size="sm" variant="ghost" onClick={() => void toggle(r)}>{r.status === 'ACTIVE' ? t('platform.admins.deactivate') : t('platform.admins.activate')}</Button>) },
  ];
  return (
    <div>
      <PageHeader title={t('platform.admins.title')} subtitle={t('platform.admins.subtitle')}
        action={<Button onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden />{t('platform.admins.add')}</Button>} />
      <DataTable columns={columns} rows={data ?? []} rowKey={(r) => r.id} loading={isLoading} error={error ? platformError(t, error) : null} onRetry={() => void refetch()} />
      {adding && <AddModal onClose={() => setAdding(false)} />}
    </div>
  );
}
