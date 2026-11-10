import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { fmtDate, fmtDateTime, platformError } from '@/features/platform/common';
import { useClasses } from '@/features/students/students-api';
import {
  currentPeriod, fmtMoney, parseRupees, statusTone, useCancelVoucher, useGenerate, usePay, useVoidPayment, useVoucher, type PaymentMethod,
} from './fees-api';

export function GenerateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const classes = useClasses();
  const gen = useGenerate();
  const [classId, setClassId] = useState('');
  const [period, setPeriod] = useState(currentPeriod());
  const [dueDate, setDueDate] = useState('');
  const [oneTime, setOneTime] = useState(false);
  const [withTransport, setWithTransport] = useState(false);
  const [withHostel, setWithHostel] = useState(false);
  const cls = classId || classes.data?.[0]?.id || '';
  const submit = async () => {
    try {
      const r = await gen.mutateAsync({ classId: cls, period, dueDate, includeOneTime: oneTime, includeTransport: withTransport, includeHostel: withHostel });
      toast.success(t('fees.generated', { created: r.created, skipped: r.skippedExisting }));
      onClose();
    } catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={t('fees.generate')} description={t('fees.generateNote')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={gen.isPending} disabled={!cls || !period || !dueDate}>{t('fees.generate')}</Button></>}>
      <div className="space-y-4">
        <Field id="gen-class" label={t('fees.class')}>
          <Select id="gen-class" value={cls} onChange={(e) => setClassId(e.target.value)}>{(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="gen-period" label={t('fees.period')}><Input id="gen-period" type="month" dir="ltr" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
          <Field id="gen-due" label={t('fees.dueDate')}><Input id="gen-due" type="date" dir="ltr" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={oneTime} onChange={(e) => setOneTime(e.target.checked)} />{t('fees.includeOneTime')}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withTransport} onChange={(e) => setWithTransport(e.target.checked)} />{t('fees.includeTransport')}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withHostel} onChange={(e) => setWithHostel(e.target.checked)} />{t('fees.includeHostel')}</label>
      </div>
    </Modal>
  );
}

function CollectModal({ voucherId, balance, open, onClose }: { voucherId: string; balance: number; open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const pay = usePay(voucherId);
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const n = parseRupees(amount);
  const tooHigh = n !== null && n > balance;
  const submit = async () => {
    if (n === null || tooHigh) return;
    try {
      const p = await pay.mutateAsync({ amount: n, method, reference: reference.trim() || null });
      toast.success(t('fees.received', { no: p.receiptNo }));
      onClose();
    } catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={t('fees.collect')} description={t('fees.balanceIs', { amount: fmtMoney(balance, i18n.language) })}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={pay.isPending} disabled={n === null || tooHigh}>{t('fees.collect')}</Button></>}>
      <div className="space-y-4">
        <Field id="pay-amount" label={t('fees.amount')} error={amount !== '' && n === null ? t('fees.amountInvalid') : tooHigh ? t('fees.amountTooHigh') : undefined}>
          <Input id="pay-amount" inputMode="numeric" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field id="pay-method" label={t('fees.method')}>
          <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {(['CASH', 'BANK', 'ONLINE'] as const).map((m) => <option key={m} value={m}>{t(`fees.methods.${m}`)}</option>)}
          </Select>
        </Field>
        <Field id="pay-ref" label={t('fees.reference')} hint={t('fees.referenceHint')}><Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} /></Field>
      </div>
    </Modal>
  );
}

function ReasonModal({ title, open, onClose, onSubmit, loading }: { title: string; open: boolean; onClose: () => void; onSubmit: (reason: string) => void; loading: boolean }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={title}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => onSubmit(reason.trim())} loading={loading} disabled={reason.trim().length < 3}>{t('common.confirm')}</Button></>}>
      <Field id="reason" label={t('fees.reason')}><Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></Field>
    </Modal>
  );
}

/** One voucher: items, receipts and the actions the user is allowed to take. */
export function VoucherModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const q = useVoucher(id);
  const voidPay = useVoidPayment();
  const cancel = useCancelVoucher();
  const [collect, setCollect] = useState(false);
  const [voidId, setVoidId] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const v = q.data;
  const fail = (e: unknown) => toast.error(t('platform.errors.generic'), platformError(t, e));
  return (
    <>
      <Modal open={Boolean(id)} onOpenChange={(o) => !o && onClose()} title={v ? `${v.voucherNo} · ${v.student.name}` : t('common.loading')}
        description={v ? `${v.className} · ${v.period} · ${t('fees.dueDate')}: ${fmtDate(v.dueDate, i18n.language)}` : undefined}
        footer={v ? (
          <>
            {can('fee.read') ? <Link to={`/app/fees/vouchers/${v.id}/print`} className="text-sm font-semibold text-brand-700 hover:underline">{t('print.actions.voucher')}</Link> : null}
            {v.status !== 'CANCELLED' ? <>
            {can('fee.manage') && v.paidAmount === 0 ? <Button variant="danger" onClick={() => setCancelOpen(true)}>{t('fees.cancelVoucher')}</Button> : null}
            {can('fee.collect') && v.balance > 0 ? <Button onClick={() => setCollect(true)}>{t('fees.collect')}</Button> : null}
            </> : null}
          </>
        ) : undefined}>
        {v ? (
          <div className="space-y-4 text-sm">
            <Badge tone={statusTone(v.status, v.overdue)}>{v.overdue ? t('fees.overdue') : t(`fees.statuses.${v.status}`)}</Badge>
            <ul className="divide-y divide-line rounded-control ring-1 ring-line">
              {v.items.map((i) => <li key={i.id} className="flex justify-between px-3 py-2"><span>{i.description}</span><span dir="ltr">{fmtMoney(i.amount, i18n.language)}</span></li>)}
              {v.discountAmount > 0 ? <li className="flex justify-between px-3 py-2 text-emerald-700"><span>{t('fees.discount')}</span><span dir="ltr">− {fmtMoney(v.discountAmount, i18n.language)}</span></li> : null}
              <li className="flex justify-between px-3 py-2 font-semibold"><span>{t('fees.net')}</span><span dir="ltr">{fmtMoney(v.netAmount, i18n.language)}</span></li>
              <li className="flex justify-between px-3 py-2"><span>{t('fees.paid')}</span><span dir="ltr">{fmtMoney(v.paidAmount, i18n.language)}</span></li>
              <li className="flex justify-between px-3 py-2 font-semibold"><span>{t('fees.balance')}</span><span dir="ltr">{fmtMoney(v.balance, i18n.language)}</span></li>
            </ul>
            {v.cancelReason ? <p className="text-muted">{t('fees.cancelledBecause', { reason: v.cancelReason })}</p> : null}
            <div>
              <h3 className="mb-2 font-semibold text-navy-900">{t('fees.receipts')}</h3>
              {v.payments.length === 0 ? <p className="text-muted">{t('fees.noReceipts')}</p> : (
                <ul className="space-y-2">
                  {v.payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control px-3 py-2 ring-1 ring-line">
                      <span className={p.voided ? 'text-muted line-through' : ''}>{p.receiptNo} · {t(`fees.methods.${p.method}`)} · {fmtDateTime(p.paidAt, i18n.language)}</span>
                      <span className="flex items-center gap-2">
                        <span dir="ltr" className={p.voided ? 'text-muted line-through' : 'font-semibold'}>{fmtMoney(p.amount, i18n.language)}</span>
                        {can('fee.read') ? <Link to={`/app/fees/payments/${p.id}/receipt`} className="text-sm font-semibold text-brand-700 hover:underline">{t('print.actions.receipt')}</Link> : null}
                        {p.voided ? <Badge tone="neutral">{t('fees.voided')}</Badge> : can('fee.manage') ? <Button size="sm" variant="ghost" onClick={() => setVoidId(p.id)}>{t('fees.void')}</Button> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : q.error ? <p className="text-sm text-rose-700">{platformError(t, q.error)}</p> : null}
      </Modal>
      {v && collect ? <CollectModal key={v.paidAmount} voucherId={v.id} balance={v.balance} open onClose={() => setCollect(false)} /> : null}
      {voidId ? <ReasonModal title={t('fees.voidTitle')} open onClose={() => setVoidId(null)} loading={voidPay.isPending}
        onSubmit={(reason) => void voidPay.mutateAsync({ id: voidId, reason }).then(() => { toast.success(t('fees.voidDone')); setVoidId(null); }, fail)} /> : null}
      {v && cancelOpen ? <ReasonModal title={t('fees.cancelVoucher')} open onClose={() => setCancelOpen(false)} loading={cancel.isPending}
        onSubmit={(reason) => void cancel.mutateAsync({ id: v.id, reason }).then(() => { toast.success(t('fees.cancelDone')); setCancelOpen(false); }, fail)} /> : null}
    </>
  );
}
