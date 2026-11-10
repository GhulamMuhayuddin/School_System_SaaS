import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { platformError } from '@/features/platform/common';
import { todayText } from '@/features/hr/hr-api';
import { parseCost, parseQty, stockAfter, useCategories, useCreateItem, useMoveStock, useUpdateItem, type Item, type StockKind } from './inventory-api';

export function ItemFormModal({ item, onClose }: { item?: Item; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const categories = useCategories();
  const create = useCreateItem();
  const update = useUpdateItem();
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [unit, setUnit] = useState(item?.unit ?? 'pcs');
  const [reorder, setReorder] = useState(item ? String(item.reorderLevel) : '0');
  const [cost, setCost] = useState(item ? String(item.unitCost) : '');
  const [location, setLocation] = useState(item?.location ?? '');
  const [opening, setOpening] = useState('');
  const r = parseQty(reorder); const c = parseCost(cost); const o = opening.trim() === '' ? 0 : parseQty(opening);
  const valid = name.trim().length >= 2 && unit.trim().length >= 1 && r !== null && c !== null && o !== null;
  const submit = async () => {
    if (!valid || r === null || c === null || o === null) return;
    const values = { name: name.trim(), category: category.trim() || null, unit: unit.trim(), reorderLevel: r, unitCost: c, location: location.trim() || null, notes: item?.notes ?? null };
    try {
      if (item) await update.mutateAsync({ id: item.id, patch: values }); else await create.mutateAsync({ ...values, openingQuantity: o });
      toast.success(t('inventory.itemSaved'));
      onClose();
    } catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(x) => !x && onClose()} title={item ? t('inventory.editItem') : t('inventory.addItem')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={create.isPending || update.isPending} disabled={!valid}>{t('inventory.save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field id="it-name" label={t('inventory.itemName')}><Input id="it-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field></div>
        <Field id="it-cat" label={t('inventory.category')}>
          <Input id="it-cat" list="it-cats" value={category} maxLength={60} onChange={(e) => setCategory(e.target.value)} />
          <datalist id="it-cats">{(categories.data ?? []).map((x) => <option key={x} value={x} />)}</datalist>
        </Field>
        <Field id="it-unit" label={t('inventory.unit')}><Input id="it-unit" value={unit} maxLength={20} onChange={(e) => setUnit(e.target.value)} /></Field>
        <Field id="it-reorder" label={t('inventory.reorderLevel')} hint={t('inventory.reorderHint')} error={r === null ? t('inventory.qtyInvalid') : undefined}><Input id="it-reorder" dir="ltr" inputMode="numeric" value={reorder} onChange={(e) => setReorder(e.target.value)} /></Field>
        <Field id="it-cost" label={t('inventory.unitCost')} error={c === null ? t('inventory.costInvalid') : undefined}><Input id="it-cost" dir="ltr" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
        <Field id="it-loc" label={t('inventory.location')}><Input id="it-loc" value={location} maxLength={80} onChange={(e) => setLocation(e.target.value)} /></Field>
        {!item ? <Field id="it-open" label={t('inventory.openingStock')} error={o === null ? t('inventory.qtyInvalid') : undefined}><Input id="it-open" dir="ltr" inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value)} /></Field> : null}
      </div>
    </Modal>
  );
}

/** Receive (IN), issue (OUT) or count (ADJUST) one item. Shows the stock before and after, and refuses what the server would refuse. */
export function StockModal({ item, kind, onClose }: { item: Item; kind: StockKind; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const move = useMoveStock();
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [party, setParty] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayText());
  const q = parseQty(qty);
  const c = parseCost(cost);
  const after = stockAfter(item.quantity, kind, q);
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayText();
  const valid = after !== null && dateOk && (kind !== 'IN' || c !== null);
  const problem = qty.trim() === '' || q === null ? (qty.trim() === '' ? undefined : t('inventory.qtyInvalid'))
    : kind === 'OUT' && q > item.quantity ? t('inventory.notEnough', { count: item.quantity, unit: item.unit })
    : kind === 'ADJUST' && q === item.quantity ? t('inventory.sameCount') : undefined;
  const submit = async () => {
    if (!valid || q === null) return;
    const values = { kind, quantity: q, ...(kind === 'IN' && cost.trim() !== '' && c !== null ? { unitCost: c } : {}), party: party.trim() || null, reference: reference.trim() || null, note: note.trim() || null, movedOn: date };
    try { await move.mutateAsync({ id: item.id, values }); toast.success(t('inventory.stockSaved')); onClose(); }
    catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(x) => !x && onClose()} title={t(`inventory.stockTitle.${kind}`, { name: item.name })} description={t('inventory.inStock', { count: item.quantity, unit: item.unit })}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={move.isPending} disabled={!valid}>{t(`inventory.stockButton.${kind}`)}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="st-qty" label={t(`inventory.qtyLabel.${kind}`)} error={problem}><Input id="st-qty" dir="ltr" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field id="st-date" label={t('inventory.date')} error={dateOk ? undefined : t('inventory.dateInvalid')}><Input id="st-date" type="date" dir="ltr" value={date} max={todayText()} onChange={(e) => setDate(e.target.value)} /></Field>
        {kind === 'IN' ? <Field id="st-cost" label={t('inventory.unitCost')} error={c === null ? t('inventory.costInvalid') : undefined}><Input id="st-cost" dir="ltr" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} /></Field> : null}
        {kind !== 'ADJUST' ? <Field id="st-party" label={t(kind === 'IN' ? 'inventory.supplier' : 'inventory.issuedTo')}><Input id="st-party" value={party} maxLength={80} onChange={(e) => setParty(e.target.value)} /></Field> : null}
        <Field id="st-ref" label={t('inventory.reference')}><Input id="st-ref" value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field id="st-note" label={t('inventory.note')}><Input id="st-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field></div>
        <p className="text-sm text-muted sm:col-span-2" aria-live="polite">{after !== null ? t('inventory.willBe', { count: after, unit: item.unit }) : ''}</p>
      </div>
    </Modal>
  );
}
