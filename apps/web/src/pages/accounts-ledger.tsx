import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input, Select } from '@/components/ui/input';
import { useAuth } from '@/features/auth/auth-context';
import { balanceOf, fmtMoney, kindTone, monthStartText, todayText, useCategories, useEntries, type LedgerEntry, type LedgerKind } from '@/features/accounts/accounts-api';
import { EntryModal, VoidEntryModal } from '@/features/accounts/accounts-modals';
import { AccountsTabs } from '@/features/accounts/accounts-tabs';
import { PageHeader, fmtDate, platformError } from '@/features/platform/common';

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <Card className="p-4"><p className="text-sm text-muted">{label}</p><p dir="ltr" className={`mt-1 text-xl font-bold ${tone ?? 'text-navy-900'}`}>{value}</p></Card>;
}

export default function AccountsLedgerPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const [kind, setKind] = useState<LedgerKind | ''>('');
  const [categoryId, setCategoryId] = useState('');
  const [from, setFrom] = useState(monthStartText());
  const [to, setTo] = useState(todayText());
  const [includeVoided, setIncludeVoided] = useState(false);
  const [adding, setAdding] = useState(false);
  const [voidId, setVoidId] = useState<string | null>(null);
  const categories = useCategories();
  const bad = Boolean(from && to && to < from);
  const list = useEntries({ kind, categoryId, from: bad ? '' : from, to: bad ? '' : to, includeVoided });
  const m = (n: number) => fmtMoney(n, i18n.language);
  const cats = (categories.data ?? []).filter((c) => !kind || c.kind === kind);
  const data = list.data;
  const columns: Column<LedgerEntry>[] = [
    { key: 'no', header: t('accounts.entryNo'), sortValue: (e) => e.entryNo, cell: (e) => <span className={e.voided ? 'text-muted line-through' : 'font-semibold'}>{e.entryNo}</span> },
    { key: 'date', header: t('accounts.date'), sortValue: (e) => e.entryDate, cell: (e) => fmtDate(e.entryDate, i18n.language) },
    { key: 'kind', header: t('accounts.type'), sortValue: (e) => e.kind, cell: (e) => <Badge tone={kindTone(e.kind)}>{t(`accounts.kinds.${e.kind}`)}</Badge> },
    { key: 'category', header: t('accounts.category'), sortValue: (e) => e.category.name, cell: (e) => e.category.name },
    { key: 'desc', header: t('accounts.description'), sortValue: (e) => e.description, cell: (e) => (
      <span className={e.voided ? 'text-muted line-through' : ''}>{e.description}{e.party ? <span className="block text-xs text-muted">{e.party}</span> : null}</span>
    ) },
    { key: 'method', header: t('accounts.method'), sortValue: (e) => e.method, cell: (e) => t(`fees.methods.${e.method}`) },
    { key: 'amount', header: t('accounts.amount'), sortValue: (e) => (e.kind === 'INCOME' ? e.amount : -e.amount), cell: (e) => (
      <span dir="ltr" className={e.voided ? 'text-muted line-through' : e.kind === 'INCOME' ? 'font-semibold text-emerald-700' : 'font-semibold text-navy-900'}>{e.kind === 'INCOME' ? '+' : '−'} {m(e.amount)}</span>
    ) },
    { key: 'actions', header: '', cell: (e) => (e.voided ? <Badge tone="neutral">{t('accounts.voided')}</Badge> : can('accounts.manage') ? <Button size="sm" variant="ghost" onClick={() => setVoidId(e.id)}>{t('accounts.void')}</Button> : null) },
  ];
  return (
    <div>
      <PageHeader title={t('accounts.title')} subtitle={t('accounts.subtitle')}
        action={can('accounts.manage') ? <Button onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden />{t('accounts.addEntry')}</Button> : undefined} />
      <AccountsTabs />
      <p className="mb-4 max-w-3xl text-sm text-muted">{t('accounts.feeNote')}</p>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="l-kind" label={t('accounts.type')}>
          <Select id="l-kind" value={kind} onChange={(e) => { setKind(e.target.value as LedgerKind | ''); setCategoryId(''); }}>
            <option value="">{t('accounts.allTypes')}</option><option value="INCOME">{t('accounts.kinds.INCOME')}</option><option value="EXPENSE">{t('accounts.kinds.EXPENSE')}</option>
          </Select>
        </Field>
        <Field id="l-cat" label={t('accounts.category')}>
          <Select id="l-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t('accounts.allCategories')}</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field id="l-from" label={t('accounts.from')}><Input id="l-from" type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field id="l-to" label={t('accounts.to')} error={bad ? t('attendance.rangeInvalid') : undefined}><Input id="l-to" type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={includeVoided} onChange={(e) => setIncludeVoided(e.target.checked)} />{t('accounts.showVoided')}</label>
      {data ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat label={t('accounts.income')} value={m(data.income)} tone="text-emerald-700" />
          <Stat label={t('accounts.expense')} value={m(data.expense)} />
          <Stat label={t('accounts.difference')} value={m(balanceOf(data.income, data.expense))} tone={balanceOf(data.income, data.expense) < 0 ? 'text-rose-700' : 'text-navy-900'} />
        </div>
      ) : null}
      {data?.truncated ? <p className="mb-3 text-sm text-amber-700">{t('accounts.truncated')}</p> : null}
      <DataTable columns={columns} rows={data?.entries ?? []} rowKey={(e) => e.id} pageSize={15} searchText={(e) => `${e.entryNo} ${e.description} ${e.party ?? ''} ${e.reference ?? ''} ${e.category.name}`}
        loading={list.isLoading} error={list.error ? platformError(t, list.error) : null} onRetry={() => void list.refetch()}
        emptyTitle={t('accounts.emptyTitle')} emptyDescription={t('accounts.emptyBody')} />
      {adding ? <EntryModal open onClose={() => setAdding(false)} /> : null}
      <VoidEntryModal key={voidId ?? 'none'} id={voidId} onClose={() => setVoidId(null)} />
    </div>
  );
}
