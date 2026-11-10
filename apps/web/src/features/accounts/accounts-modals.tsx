import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { platformError } from '@/features/platform/common';
import { parseRupees, todayText, useCategories, useCreateEntry, useVoidEntry, type LedgerKind, type PaymentMethod } from './accounts-api';

/** Add one income or expense entry. Entries cannot be edited later; a wrong one is voided and entered again. */
export function EntryModal({ open, onClose, defaultKind = 'EXPENSE' }: { open: boolean; onClose: () => void; defaultKind?: LedgerKind }) {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateEntry();
  const categories = useCategories();
  const today = todayText();
  const [kind, setKind] = useState<LedgerKind>(defaultKind);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [entryDate, setEntryDate] = useState(today);
  const [description, setDescription] = useState('');
  const [party, setParty] = useState('');
  const [reference, setReference] = useState('');
  const usable = (categories.data ?? []).filter((c) => c.kind === kind && c.isActive);
  const cat = usable.some((c) => c.id === categoryId) ? categoryId : usable[0]?.id ?? '';
  const n = parseRupees(amount);
  const dateOk = entryDate !== '' && entryDate <= today;
  const valid = Boolean(cat) && n !== null && dateOk && description.trim().length >= 3;
  const submit = async () => {
    if (!valid || n === null) return;
    try {
      const e = await create.mutateAsync({ kind, categoryId: cat, amount: n, method, entryDate, description: description.trim(), party: party.trim() || null, reference: reference.trim() || null });
      toast.success(t('accounts.saved', { no: e.entryNo }));
      onClose();
    } catch (err) { toast.error(t('platform.errors.generic'), platformError(t, err)); }
  };
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={t('accounts.addEntry')} description={t('accounts.addEntryNote')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={create.isPending} disabled={!valid}>{t('accounts.save')}</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="en-kind" label={t('accounts.type')}>
            <Select id="en-kind" value={kind} onChange={(e) => setKind(e.target.value as LedgerKind)}>
              <option value="EXPENSE">{t('accounts.kinds.EXPENSE')}</option><option value="INCOME">{t('accounts.kinds.INCOME')}</option>
            </Select>
          </Field>
          <Field id="en-cat" label={t('accounts.category')}>
            <Select id="en-cat" value={cat} onChange={(e) => setCategoryId(e.target.value)}>{usable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          </Field>
        </div>
        {categories.data && usable.length === 0 ? <p className="text-sm text-amber-700">{t('accounts.noCategoryOfKind')} <Link className="font-semibold underline" to="/app/accounts/categories" onClick={onClose}>{t('accounts.tabCategories')}</Link></p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="en-amount" label={t('accounts.amount')} error={amount !== '' && n === null ? t('accounts.amountInvalid') : undefined}>
            <Input id="en-amount" inputMode="numeric" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field id="en-date" label={t('accounts.date')} error={!dateOk ? t('accounts.dateInvalid') : undefined}>
            <Input id="en-date" type="date" dir="ltr" max={today} value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </Field>
        </div>
        <Field id="en-desc" label={t('accounts.description')}><Input id="en-desc" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="en-method" label={t('accounts.method')}>
            <Select id="en-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {(['CASH', 'BANK', 'ONLINE'] as const).map((m) => <option key={m} value={m}>{t(`fees.methods.${m}`)}</option>)}
            </Select>
          </Field>
          <Field id="en-party" label={t('accounts.party')} hint={t('accounts.partyHint')}><Input id="en-party" value={party} maxLength={80} onChange={(e) => setParty(e.target.value)} /></Field>
          <Field id="en-ref" label={t('accounts.reference')}><Input id="en-ref" value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

/** Asks why an entry is voided (at least 3 characters), then voids it. */
export function VoidEntryModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const voidEntry = useVoidEntry();
  const [reason, setReason] = useState('');
  const submit = async () => {
    if (!id) return;
    try { await voidEntry.mutateAsync({ id, reason: reason.trim() }); toast.success(t('accounts.voidDone')); setReason(''); onClose(); }
    catch (err) { toast.error(t('platform.errors.generic'), platformError(t, err)); }
  };
  return (
    <Modal open={Boolean(id)} onOpenChange={(o) => !o && onClose()} title={t('accounts.voidTitle')} description={t('accounts.voidNote')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => void submit()} loading={voidEntry.isPending} disabled={reason.trim().length < 3}>{t('common.confirm')}</Button></>}>
      <Field id="void-reason" label={t('accounts.reason')}><Input id="void-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}
