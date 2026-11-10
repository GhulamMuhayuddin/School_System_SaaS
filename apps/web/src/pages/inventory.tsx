import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { fmtMoney } from '@/features/fees/fees-api';
import {
  STOCK_KINDS, deltaText, stockTone, useCategories, useInventorySummary, useItems, useMovements, useUpdateItem, type Item, type Movement, type StockKind,
} from '@/features/inventory/inventory-api';
import { ItemFormModal, StockModal } from '@/features/inventory/inventory-modals';
import { PageHeader, fmtDate, platformError } from '@/features/platform/common';
import { cn } from '@/lib/cn';

type Tab = 'items' | 'movements';

function ItemsTab() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [retired, setRetired] = useState(false);
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [stock, setStock] = useState<{ item: Item; kind: StockKind } | null>(null);
  const categories = useCategories();
  const items = useItems({ q: q.trim() || undefined, category: category || undefined, lowOnly, includeInactive: retired });
  const update = useUpdateItem();
  const manage = can('inventory.manage');
  const toggle = (i: Item) => void update.mutateAsync({ id: i.id, patch: { active: !i.active } }).catch((e) => toast.error(t('platform.errors.generic'), platformError(t, e)));
  const money = (n: number) => <span dir="ltr">{fmtMoney(n, i18n.language)}</span>;
  const columns: Column<Item>[] = [
    { key: 'name', header: t('inventory.item'), sortValue: (i) => i.name, cell: (i) => <span>{manage ? <button type="button" className="text-start font-semibold text-brand-700 hover:underline" onClick={() => setEditing(i)}>{i.name}</button> : <b>{i.name}</b>}<span className="block text-xs text-muted"><span dir="ltr">{i.code}</span>{i.location ? ` · ${i.location}` : ''}</span></span> },
    { key: 'category', header: t('inventory.category'), sortValue: (i) => i.category ?? '', cell: (i) => i.category ?? '—' },
    { key: 'qty', header: t('inventory.stock'), sortValue: (i) => i.quantity, cell: (i) => <Badge tone={stockTone(i)}><span dir="ltr">{i.quantity} {i.unit}</span></Badge> },
    { key: 'reorder', header: t('inventory.reorderLevel'), sortValue: (i) => i.reorderLevel, cell: (i) => <span dir="ltr">{i.reorderLevel > 0 ? i.reorderLevel : '—'}</span> },
    { key: 'cost', header: t('inventory.unitCost'), sortValue: (i) => i.unitCost, cell: (i) => money(i.unitCost) },
    { key: 'value', header: t('inventory.value'), sortValue: (i) => i.value, cell: (i) => money(i.value) },
    ...(manage ? [{ key: 'x', header: '', sortValue: () => '', cell: (i: Item) => (
      <span className="flex flex-wrap gap-1">
        {i.active ? <>
          <Button size="sm" onClick={() => setStock({ item: i, kind: 'IN' })}>{t('inventory.receive')}</Button>
          <Button size="sm" variant="secondary" onClick={() => setStock({ item: i, kind: 'OUT' })} disabled={i.quantity === 0}>{t('inventory.issue')}</Button>
          <Button size="sm" variant="ghost" onClick={() => setStock({ item: i, kind: 'ADJUST' })}>{t('inventory.count')}</Button>
        </> : null}
        <Button size="sm" variant="ghost" onClick={() => toggle(i)}>{i.active ? t('inventory.deactivate') : t('inventory.activate')}</Button>
      </span>) }] : []),
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-48"><label htmlFor="inv-q" className="mb-1 block text-sm font-medium text-navy-900">{t('inventory.search')}</label><Input id="inv-q" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="min-w-44">
          <Field id="inv-cat" label={t('inventory.category')}>
            <Select id="inv-cat" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">{t('inventory.allCategories')}</option>{(categories.data ?? []).map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          </Field>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />{t('inventory.lowOnly')}</label>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={retired} onChange={(e) => setRetired(e.target.checked)} />{t('inventory.showInactive')}</label>
        {manage ? <Button onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden />{t('inventory.addItem')}</Button> : null}
      </div>
      <DataTable columns={columns} rows={items.data?.items ?? []} rowKey={(i) => i.id} pageSize={20} searchText={(i) => `${i.name} ${i.code} ${i.category ?? ''}`}
        loading={items.isLoading} error={items.error ? platformError(t, items.error) : null} onRetry={() => void items.refetch()}
        emptyTitle={t('inventory.itemsEmptyTitle')} emptyDescription={t('inventory.itemsEmptyBody')} />
      {items.data?.truncated ? <p className="mt-2 text-xs text-muted">{t('inventory.truncated')}</p> : null}
      {editing ? <ItemFormModal key={editing === 'new' ? 'new' : editing.id} item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
      {stock ? <StockModal key={`${stock.item.id}-${stock.kind}`} item={stock.item} kind={stock.kind} onClose={() => setStock(null)} /> : null}
    </div>
  );
}

function MovementsTab() {
  const { t, i18n } = useTranslation();
  const [kind, setKind] = useState<StockKind | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const moves = useMovements({ kind: kind || undefined, from: from || undefined, to: to || undefined });
  const columns: Column<Movement>[] = [
    { key: 'date', header: t('inventory.date'), sortValue: (m) => m.movedOn, cell: (m) => fmtDate(m.movedOn, i18n.language) },
    { key: 'item', header: t('inventory.item'), sortValue: (m) => m.item.name, cell: (m) => <span>{m.item.name}<span className="block text-xs text-muted" dir="ltr">{m.item.code}</span></span> },
    { key: 'kind', header: t('inventory.movement'), sortValue: (m) => m.kind, cell: (m) => <Badge tone={m.kind === 'IN' ? 'success' : m.kind === 'OUT' ? 'warning' : 'neutral'}>{t(`inventory.kinds.${m.kind}`)}</Badge> },
    { key: 'delta', header: t('inventory.change'), sortValue: (m) => m.delta, cell: (m) => <b dir="ltr" className={m.delta < 0 ? 'text-rose-700' : 'text-emerald-700'}>{deltaText(m.delta)} {m.item.unit}</b> },
    { key: 'balance', header: t('inventory.balance'), sortValue: (m) => m.balanceAfter, cell: (m) => <span dir="ltr">{m.balanceAfter}</span> },
    { key: 'who', header: t('inventory.partyRef'), sortValue: (m) => m.party ?? '', cell: (m) => <span>{m.party ?? '—'}{m.reference ? <span className="block text-xs text-muted" dir="ltr">{m.reference}</span> : null}{m.note ? <span className="block text-xs text-muted">{m.note}</span> : null}</span> },
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-44">
          <Field id="mv-kind" label={t('inventory.movement')}>
            <Select id="mv-kind" value={kind} onChange={(e) => setKind(e.target.value as StockKind | '')}><option value="">{t('inventory.allMovements')}</option>{STOCK_KINDS.map((k) => <option key={k} value={k}>{t(`inventory.kinds.${k}`)}</option>)}</Select>
          </Field>
        </div>
        <Field id="mv-from" label={t('inventory.from')}><Input id="mv-from" type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field id="mv-to" label={t('inventory.to')}><Input id="mv-to" type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <DataTable columns={columns} rows={moves.data?.movements ?? []} rowKey={(m) => m.id} pageSize={20} searchText={(m) => `${m.item.name} ${m.item.code} ${m.party ?? ''} ${m.reference ?? ''}`}
        loading={moves.isLoading} error={moves.error ? platformError(t, moves.error) : null} onRetry={() => void moves.refetch()}
        emptyTitle={t('inventory.movesEmptyTitle')} emptyDescription={t('inventory.movesEmptyBody')} />
      {moves.data?.truncated ? <p className="mt-2 text-xs text-muted">{t('inventory.truncatedMoves')}</p> : null}
    </div>
  );
}

export default function InventoryPage() {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<Tab>('items');
  const s = useInventorySummary().data;
  const chip = (label: string, value: string | number, warn = false) => (
    <Card key={label} className="p-4"><p className="text-xs text-muted">{label}</p><p className={cn('text-xl font-extrabold', warn ? 'text-rose-700' : 'text-navy-900')} dir="ltr">{value}</p></Card>
  );
  const tabs: Tab[] = ['items', 'movements'];
  return (
    <div className="space-y-5">
      <PageHeader title={t('inventory.title')} subtitle={t('inventory.subtitle')} />
      {s ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {chip(t('inventory.items'), s.items)}{chip(t('inventory.lowItems'), s.lowItems, s.lowItems > 0)}{chip(t('inventory.outOfStock'), s.outOfStock, s.outOfStock > 0)}{chip(t('inventory.stockValue'), fmtMoney(s.totalValue, i18n.language))}
        </div>
      ) : null}
      <nav aria-label={t('inventory.sections')} className="flex gap-1 overflow-x-auto rounded-card bg-white p-1 ring-1 ring-line">
        {tabs.map((x) => (
          <button key={x} type="button" aria-current={tab === x ? 'page' : undefined} onClick={() => setTab(x)}
            className={cn('whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold', tab === x ? 'bg-brand-600 text-white' : 'text-muted hover:bg-canvas')}>{t(`inventory.tabs.${x}`)}</button>
        ))}
      </nav>
      {tab === 'items' && <ItemsTab />}
      {tab === 'movements' && <MovementsTab />}
    </div>
  );
}
