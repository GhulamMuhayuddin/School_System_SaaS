import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { fmtMoney } from '@/features/fees/fees-api';
import { platformError } from '@/features/platform/common';
import {
  PAY_METHODS, currentPeriod, parseAmount, slipNetWith, todayText, useCreateRun, usePaySlip, useSetSalary, useUpdateSlip, useVoidPayment,
  type PayMethod, type Payslip, type SalaryRow,
} from './hr-api';

export function NewRunModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateRun();
  const [period, setPeriod] = useState(currentPeriod());
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(period) && period <= currentPeriod();
  const submit = async () => {
    if (!valid) return;
    try { const run = await create.mutateAsync(period); toast.success(t('payroll.runCreated')); onCreated(run.id); onClose(); }
    catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('payroll.newRun')} description={t('payroll.newRunHint')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={create.isPending} disabled={!valid}>{t('payroll.makeRun')}</Button></>}>
      <Field id="run-period" label={t('payroll.month')} error={valid ? undefined : t('payroll.monthInvalid')}><Input id="run-period" type="month" dir="ltr" value={period} max={currentPeriod()} onChange={(e) => setPeriod(e.target.value)} /></Field>
    </Modal>
  );
}

export function SalaryModal({ row, onClose }: { row: SalaryRow; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const save = useSetSalary();
  const s = row.salary;
  const [basic, setBasic] = useState(s ? String(s.basic) : '');
  const [allow, setAllow] = useState(s ? String(s.allowances) : '');
  const [fixed, setFixed] = useState(s ? String(s.fixedDeduction) : '');
  const [notes, setNotes] = useState(s?.notes ?? '');
  const b = parseAmount(basic); const a = parseAmount(allow); const f = parseAmount(fixed);
  const gross = (b ?? 0) + (a ?? 0);
  const valid = b !== null && b >= 1 && a !== null && f !== null && f <= gross;
  const submit = async () => {
    if (!valid || b === null || a === null || f === null) return;
    try { await save.mutateAsync({ staffId: row.staff.id, values: { basic: b, allowances: a, fixedDeduction: f, notes: notes.trim() || null } }); toast.success(t('payroll.salarySaved')); onClose(); }
    catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  const bad = (v: number | null) => (v === null ? t('payroll.amountInvalid') : undefined);
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('payroll.setSalary', { name: row.staff.name })}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={save.isPending} disabled={!valid}>{t('payroll.save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="sal-basic" label={t('payroll.basic')} error={basic !== '' ? bad(b) : undefined}><Input id="sal-basic" dir="ltr" inputMode="numeric" value={basic} onChange={(e) => setBasic(e.target.value)} /></Field>
        <Field id="sal-allow" label={t('payroll.allowances')} error={bad(a)}><Input id="sal-allow" dir="ltr" inputMode="numeric" value={allow} onChange={(e) => setAllow(e.target.value)} /></Field>
        <Field id="sal-fixed" label={t('payroll.fixedDeduction')} hint={t('payroll.fixedHint')} error={bad(f) ?? (f !== null && f > gross ? t('payroll.fixedTooBig') : undefined)}><Input id="sal-fixed" dir="ltr" inputMode="numeric" value={fixed} onChange={(e) => setFixed(e.target.value)} /></Field>
        <p className="self-end pb-2 text-sm text-muted">{t('payroll.gross')}: <b dir="ltr">{fmtMoney(gross, i18n.language)}</b></p>
        <div className="sm:col-span-2"><Field id="sal-notes" label={t('payroll.notes')}><Input id="sal-notes" value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} /></Field></div>
      </div>
    </Modal>
  );
}

export function SlipEditModal({ slip, onClose }: { slip: Payslip; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const update = useUpdateSlip();
  const [bonus, setBonus] = useState(String(slip.bonus));
  const [other, setOther] = useState(String(slip.otherDeduction));
  const [note, setNote] = useState(slip.note ?? '');
  const b = parseAmount(bonus); const o = parseAmount(other);
  const net = b !== null && o !== null ? slipNetWith(slip, b, o) : null;
  const valid = net !== null && net >= 0;
  const submit = async () => {
    if (!valid || b === null || o === null) return;
    try { await update.mutateAsync({ id: slip.id, patch: { bonus: b, otherDeduction: o, note: note.trim() || null } }); toast.success(t('payroll.slipSaved')); onClose(); }
    catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(x) => !x && onClose()} title={t('payroll.editSlip', { name: slip.staff.name })} description={`${slip.slipNo} · ${t('payroll.gross')} ${fmtMoney(slip.gross, i18n.language)}`}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={update.isPending} disabled={!valid}>{t('payroll.save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="sl-bonus" label={t('payroll.bonus')} error={b === null ? t('payroll.amountInvalid') : undefined}><Input id="sl-bonus" dir="ltr" inputMode="numeric" value={bonus} onChange={(e) => setBonus(e.target.value)} /></Field>
        <Field id="sl-other" label={t('payroll.otherDeduction')} error={o === null ? t('payroll.amountInvalid') : undefined}><Input id="sl-other" dir="ltr" inputMode="numeric" value={other} onChange={(e) => setOther(e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field id="sl-note" label={t('payroll.note')}><Input id="sl-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field></div>
        <p className={net !== null && net < 0 ? 'text-sm font-semibold text-rose-700 sm:col-span-2' : 'text-sm text-muted sm:col-span-2'} aria-live="polite">
          {net === null ? '' : net < 0 ? t('payroll.deductionsTooBig') : `${t('payroll.net')}: ${fmtMoney(net, i18n.language)}`}
        </p>
      </div>
    </Modal>
  );
}

export function PayModal({ slip, onClose }: { slip: Payslip; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const pay = usePaySlip();
  const [method, setMethod] = useState<PayMethod>('CASH');
  const [paidOn, setPaidOn] = useState(todayText());
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(paidOn) && paidOn <= todayText();
  const submit = async () => {
    if (!valid) return;
    try { await pay.mutateAsync({ id: slip.id, method, paidOn }); toast.success(t('payroll.paidToast')); onClose(); }
    catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('payroll.payTitle', { name: slip.staff.name })} description={t('payroll.payHint', { amount: fmtMoney(slip.net, i18n.language) })}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={pay.isPending} disabled={!valid}>{t('payroll.pay')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="pay-method" label={t('payroll.method')}><Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>{PAY_METHODS.map((m) => <option key={m} value={m}>{t(`payroll.methods.${m}`)}</option>)}</Select></Field>
        <Field id="pay-date" label={t('payroll.paidOn')} error={valid ? undefined : t('payroll.dateInvalid')}><Input id="pay-date" type="date" dir="ltr" value={paidOn} max={todayText()} onChange={(e) => setPaidOn(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export function VoidPaymentModal({ slip, onClose }: { slip: Payslip; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const voidIt = useVoidPayment();
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= 3;
  const submit = async () => {
    if (!valid) return;
    try { await voidIt.mutateAsync({ id: slip.id, reason: reason.trim() }); toast.success(t('payroll.voidedToast')); onClose(); }
    catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('payroll.voidTitle', { name: slip.staff.name })} description={t('payroll.voidHint')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => void submit()} loading={voidIt.isPending} disabled={!valid}>{t('payroll.voidPayment')}</Button></>}>
      <Field id="void-reason" label={t('payroll.voidReason')}><Input id="void-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}
