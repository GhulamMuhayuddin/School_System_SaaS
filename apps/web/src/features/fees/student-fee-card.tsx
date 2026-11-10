import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { platformError } from '@/features/platform/common';
import {
  concessionLabel, fmtMoney, parseConcession, statusTone, useConcession, useRemoveConcession, useSetConcession, useVouchers,
  type Concession, type ConcessionKind,
} from './fees-api';

const RECENT = 5;

function ConcessionModal({ studentId, current, onClose }: { studentId: string; current: Concession | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const save = useSetConcession(studentId);
  const [kind, setKind] = useState<ConcessionKind>(current?.kind ?? 'PERCENT');
  const [value, setValue] = useState(current ? String(current.value) : '');
  const [reason, setReason] = useState(current?.reason ?? '');
  const [error, setError] = useState<string | null>(null);
  const parsed = parseConcession(kind, value);
  const submit = async () => {
    if (parsed === null) return;
    setError(null);
    try {
      await save.mutateAsync({ kind, value: parsed, reason: reason.trim() || null });
      toast.success(t('fees.concessionSaved'));
      onClose();
    } catch (e) {
      setError(platformError(t, e));
    }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('fees.concession')} description={t('fees.concessionNote')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} disabled={parsed === null} loading={save.isPending}>{t('fees.save')}</Button></>}>
      <div className="space-y-4">
        {error ? <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p> : null}
        <Field id="cn-kind" label={t('fees.concessionKind')}>
          <Select id="cn-kind" value={kind} onChange={(e) => setKind(e.target.value as ConcessionKind)}>
            <option value="PERCENT">{t('fees.concessionKinds.PERCENT')}</option>
            <option value="FIXED">{t('fees.concessionKinds.FIXED')}</option>
          </Select>
        </Field>
        <Field id="cn-value" label={t('fees.concessionValue')} error={value && parsed === null ? t(kind === 'PERCENT' ? 'fees.percentInvalid' : 'fees.amountInvalid') : undefined}>
          <Input id="cn-value" inputMode="numeric" dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field id="cn-reason" label={t('fees.reason')}>
          <Input id="cn-reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** Fee summary and concession of one student (shown on the student page to people who may read fees). */
export function StudentFeeCard({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const vouchers = useVouchers({ studentId });
  const concession = useConcession(studentId);
  const remove = useRemoveConcession(studentId);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (vouchers.error) return null; // the rest of the student page stays useful; a failure here is not worth a full-page error
  const canManage = can('fee.manage');
  const live = (vouchers.data ?? []).filter((v) => v.status !== 'CANCELLED');
  const sum = (pick: (v: (typeof live)[number]) => number) => live.reduce((n, v) => n + pick(v), 0);
  const overdue = live.filter((v) => v.overdue).reduce((n, v) => n + v.balance, 0);
  const recent = [...live].sort((a, b) => b.period.localeCompare(a.period)).slice(0, RECENT);
  const c = concession.data ?? null;
  const money = (n: number) => <span dir="ltr">{fmtMoney(n, i18n.language)}</span>;
  const doRemove = async () => {
    try {
      await remove.mutateAsync();
      toast.success(t('fees.concessionRemoved'));
      setConfirm(false);
    } catch (e) {
      toast.error(t('platform.errors.generic'), platformError(t, e));
    }
  };
  return (
    <Card className="p-5">
      <CardHeader title={t('fees.cardTitle')} description={t('fees.cardNote')} />
      {vouchers.isLoading || !vouchers.data ? <Skeleton className="mt-4 h-16" /> : live.length === 0 ? <p className="mt-3 text-sm text-muted">{t('fees.cardEmpty')}</p> : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="rounded-full bg-canvas px-3 py-1">{t('fees.net')}: {money(sum((v) => v.netAmount))}</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{t('fees.paid')}: {money(sum((v) => v.paidAmount))}</span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">{t('fees.balance')}: {money(sum((v) => v.balance))}</span>
            {overdue > 0 ? <Badge tone="danger">{t('fees.overdueAmount')}: {money(overdue)}</Badge> : null}
          </div>
          <ul className="divide-y divide-line text-sm">
            {recent.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span dir="ltr" className="font-semibold">{v.period}</span> · <span dir="ltr" className="text-muted">{v.voucherNo}</span></span>
                <span className="flex items-center gap-2">{money(v.balance)}<Badge tone={statusTone(v.status, v.overdue)}>{t(`fees.statuses.${v.status}`)}</Badge></span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 border-t border-line pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            <span className="font-semibold text-navy-900">{t('fees.concession')}: </span>
            {concession.isLoading ? '…' : c ? <><Badge tone="brand">{concessionLabel(c, i18n.language)}</Badge>{c.reason ? <span className="ms-2 text-muted">{c.reason}</span> : null}</> : <span className="text-muted">{t('fees.concessionNone')}</span>}
          </p>
          {canManage && !concession.isLoading ? (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setModal(true)}>{c ? t('fees.editConcession') : t('fees.setConcession')}</Button>
              {c ? <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>{t('fees.removeConcession')}</Button> : null}
            </div>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted">{t('fees.concessionNote')}</p>
      </div>
      {modal ? <ConcessionModal studentId={studentId} current={c} onClose={() => setModal(false)} /> : null}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={t('fees.removeConcession')} description={t('fees.removeConcessionNote')}
        confirmLabel={t('fees.remove')} danger loading={remove.isPending} onConfirm={() => void doRemove()} />
    </Card>
  );
}
