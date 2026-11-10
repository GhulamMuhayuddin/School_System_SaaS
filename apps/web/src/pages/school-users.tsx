import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { PageHeader, fmtDateTime, platformError } from '@/features/platform/common';
import {
  useCreateUser, useRoleOptions, useSchoolUsers, useSetUserStatus, useUpdateUser, type RoleOption, type SchoolUser,
} from '@/features/school/school-api';

const roleName = (t: TFunction, r: { key: string; name: string }) => t(`roles.${r.key}`, { defaultValue: r.name });

const createSchema = z.object({
  firstName: z.string().trim().min(1, 'platform.validation.required').max(80),
  lastName: z.string().trim().min(1, 'platform.validation.required').max(80),
  email: z.string().trim().email('platform.validation.email'),
  phone: z.string().trim().max(40),
  roleId: z.string().uuid('platform.validation.required'),
  password: z.string().min(10, 'platform.validation.password'),
});
type CreateValues = z.infer<typeof createSchema>;

function CreateModal({ roles, onClose }: { roles: RoleOption[]; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateUser();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<CreateValues>({ resolver: zodResolver(createSchema) });
  const e = (m?: string) => (m ? t(m) : undefined);
  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    try {
      await create.mutateAsync({ ...v, phone: v.phone || null });
      toast.success(t('schoolAdmin.users.created'));
      onClose();
    } catch (err) {
      setServerError(platformError(t, err));
    }
  });
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('schoolAdmin.users.addTitle')} description={t('schoolAdmin.users.addDesc')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="create-user" loading={create.isPending}>{t('schoolAdmin.users.add')}</Button></>}>
      <form id="create-user" onSubmit={onSubmit} noValidate className="space-y-4">
        {serverError && <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{serverError}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="cu-fn" label={t('platform.firstName')} error={e(errors.firstName?.message)}><Input id="cu-fn" {...register('firstName')} /></Field>
          <Field id="cu-ln" label={t('platform.lastName')} error={e(errors.lastName?.message)}><Input id="cu-ln" {...register('lastName')} /></Field>
        </div>
        <Field id="cu-email" label={t('platform.email')} error={e(errors.email?.message)}><Input id="cu-email" type="email" dir="ltr" autoComplete="off" {...register('email')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="cu-phone" label={t('platform.schools.phone')}><Input id="cu-phone" dir="ltr" {...register('phone')} /></Field>
          <Field id="cu-role" label={t('schoolAdmin.users.role')} error={e(errors.roleId?.message)}>
            <Select id="cu-role" defaultValue="" {...register('roleId')}>
              <option value="" disabled>{t('schoolAdmin.users.chooseRole')}</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{roleName(t, r)}</option>)}
            </Select>
          </Field>
        </div>
        <Field id="cu-pw" label={t('platform.initialPassword')} hint={t('platform.passwordHint')} error={e(errors.password?.message)}><Input id="cu-pw" type="password" dir="ltr" autoComplete="new-password" {...register('password')} /></Field>
      </form>
    </Modal>
  );
}

function EditModal({ target, roles, isSelf, onClose }: { target: SchoolUser; roles: RoleOption[]; isSelf: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const update = useUpdateUser();
  const [first, setFirst] = useState(target.firstName);
  const [last, setLast] = useState(target.lastName);
  const [phone, setPhone] = useState(target.phone ?? '');
  const [roleId, setRoleId] = useState(target.role.id);
  const [error, setError] = useState<string | null>(null);
  const roleChanged = roleId !== target.role.id;
  const submit = async () => {
    setError(null);
    try {
      await update.mutateAsync({ id: target.id, firstName: first.trim(), lastName: last.trim(), phone: phone.trim() || null, ...(roleChanged ? { roleId } : {}) });
      toast.success(t('platform.detail.saved'));
      onClose();
    } catch (err) {
      setError(platformError(t, err));
    }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('schoolAdmin.users.editTitle')} description={target.email}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} disabled={!first.trim() || !last.trim()} loading={update.isPending}>{t('platform.save')}</Button></>}>
      <div className="space-y-4">
        {error && <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="eu-fn" label={t('platform.firstName')}><Input id="eu-fn" value={first} onChange={(e) => setFirst(e.target.value)} /></Field>
          <Field id="eu-ln" label={t('platform.lastName')}><Input id="eu-ln" value={last} onChange={(e) => setLast(e.target.value)} /></Field>
        </div>
        <Field id="eu-phone" label={t('platform.schools.phone')}><Input id="eu-phone" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field id="eu-role" label={t('schoolAdmin.users.role')} hint={isSelf ? t('schoolAdmin.users.ownRole') : roleChanged ? t('schoolAdmin.users.roleNote') : undefined}>
          <Select id="eu-role" value={roleId} disabled={isSelf} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => <option key={r.id} value={r.id}>{roleName(t, r)}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

export default function SchoolUsersPage() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { user: me } = useAuth();
  const users = useSchoolUsers();
  const roles = useRoleOptions();
  const setStatus = useSetUserStatus();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SchoolUser | null>(null);
  const [roleFilter, setRoleFilter] = useState('');

  const toggle = async (u: SchoolUser) => {
    try {
      await setStatus.mutateAsync({ id: u.id, status: u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
    } catch (err) {
      toast.error(t('platform.errors.generic'), platformError(t, err));
    }
  };
  const rows = (users.data ?? []).filter((u) => !roleFilter || u.role.id === roleFilter);
  const columns: Column<SchoolUser>[] = [
    { key: 'name', header: t('platform.admins.name'), sortValue: (r) => `${r.firstName} ${r.lastName}`, cell: (r) => <span className="font-semibold">{r.firstName} {r.lastName}{r.id === me?.id && <Badge tone="brand" className="ms-2">{t('platform.admins.you')}</Badge>}<span className="block text-xs font-normal text-muted" dir="ltr">{r.email}</span></span> },
    { key: 'role', header: t('schoolAdmin.users.role'), sortValue: (r) => r.role.name, cell: (r) => roleName(t, r.role) },
    { key: 'login', header: t('platform.admins.lastLogin'), sortValue: (r) => r.lastLoginAt ?? '', cell: (r) => (r.lastLoginAt ? fmtDateTime(r.lastLoginAt, i18n.language) : t('platform.neverLoggedIn')) },
    { key: 'status', header: t('platform.schools.status'), cell: (r) => <Badge tone={r.status === 'ACTIVE' ? 'success' : 'neutral'}>{t(`platform.userStatus.${r.status}`)}</Badge> },
    { key: 'actions', header: '', cell: (r) => (
      <span className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>{t('platform.detail.edit')}</Button>
        {r.id !== me?.id && <Button size="sm" variant="ghost" onClick={() => void toggle(r)}>{r.status === 'ACTIVE' ? t('platform.admins.deactivate') : t('platform.admins.activate')}</Button>}
      </span>
    ) },
  ];
  return (
    <div>
      <PageHeader title={t('schoolAdmin.users.title')} subtitle={t('schoolAdmin.users.subtitle')}
        action={<Button onClick={() => setAdding(true)} disabled={!roles.data}><Plus className="size-4" aria-hidden />{t('schoolAdmin.users.add')}</Button>} />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} pageSize={10}
        searchText={(r) => `${r.firstName} ${r.lastName} ${r.email}`}
        loading={users.isLoading} error={users.error ? platformError(t, users.error) : null} onRetry={() => void users.refetch()}
        emptyTitle={t('schoolAdmin.users.emptyTitle')} emptyDescription={t('schoolAdmin.users.emptyBody')}
        toolbar={
          <Select aria-label={t('schoolAdmin.users.role')} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-auto">
            <option value="">{t('schoolAdmin.users.allRoles')}</option>
            {(roles.data ?? []).map((r) => <option key={r.id} value={r.id}>{roleName(t, r)}</option>)}
          </Select>
        } />
      {adding && roles.data && <CreateModal roles={roles.data} onClose={() => setAdding(false)} />}
      {editing && roles.data && <EditModal target={editing} roles={roles.data} isSelf={editing.id === me?.id} onClose={() => setEditing(null)} />}
    </div>
  );
}
