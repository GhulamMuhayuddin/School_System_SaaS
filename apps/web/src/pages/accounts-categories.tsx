import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { useAddDefaultCategories, useCategories, useCreateCategory, useUpdateCategory, type LedgerKind } from '@/features/accounts/accounts-api';
import { AccountsTabs } from '@/features/accounts/accounts-tabs';
import { PageHeader, platformError } from '@/features/platform/common';

function KindCard({ kind, canEdit }: { kind: LedgerKind; canEdit: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const list = useCategories(kind);
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const [name, setName] = useState('');
  const fail = (e: unknown) => toast.error(t('platform.errors.generic'), platformError(t, e));
  return (
    <Card className="p-5">
      <h2 className="mb-3 font-semibold text-navy-900">{t(`accounts.kindsPlural.${kind}`)}</h2>
      <ul className="mb-4 divide-y divide-line text-sm">
        {(list.data ?? []).map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2">
            <span className="flex items-center gap-2">{c.name}{c.isActive ? null : <Badge tone="neutral">{t('accounts.inactive')}</Badge>}</span>
            {canEdit ? <Button size="sm" variant="ghost" onClick={() => void update.mutateAsync({ id: c.id, isActive: !c.isActive }).catch(fail)}>{c.isActive ? t('accounts.deactivate') : t('accounts.activate')}</Button> : null}
          </li>
        ))}
        {list.data?.length === 0 ? <li className="py-2 text-muted">{t('accounts.noCategories')}</li> : null}
      </ul>
      {canEdit ? (
        <div className="flex items-end gap-2">
          <div className="flex-1"><Field id={`cat-${kind}`} label={t('accounts.newCategory')}><Input id={`cat-${kind}`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></Field></div>
          <Button loading={create.isPending} disabled={name.trim().length < 2} onClick={() => void create.mutateAsync({ kind, name: name.trim() }).then(() => setName(''), fail)}>{t('accounts.addCategory')}</Button>
        </div>
      ) : null}
    </Card>
  );
}

export default function AccountsCategoriesPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const defaults = useAddDefaultCategories();
  const canEdit = can('accounts.manage');
  const addDefaults = async () => {
    try { const r = await defaults.mutateAsync(); toast.success(r.created > 0 ? t('accounts.defaultsAdded', { count: r.created }) : t('accounts.defaultsNone')); }
    catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <div>
      <PageHeader title={t('accounts.title')} subtitle={t('accounts.categoriesSubtitle')}
        action={canEdit ? <Button variant="secondary" onClick={() => void addDefaults()} loading={defaults.isPending}>{t('accounts.addDefaults')}</Button> : undefined} />
      <AccountsTabs />
      <div className="grid gap-5 lg:grid-cols-2">
        <KindCard kind="INCOME" canEdit={canEdit} />
        <KindCard kind="EXPENSE" canEdit={canEdit} />
      </div>
    </div>
  );
}
