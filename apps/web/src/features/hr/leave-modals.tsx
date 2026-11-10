import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rangeArrow } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { platformError } from '@/features/platform/common';
import { useStaffList } from '@/features/staff/staff-api';
import { daysBetween, parseQuota, todayText, useApplyLeave, useCreateLeaveType, useDecideLeave, useLeaveTypes, useUpdateLeaveType, type LeaveRequest, type LeaveType } from './hr-api';

/** Apply for leave. With `onBehalf` (approvers) a staff member can be picked; otherwise it is always the signed-in person. */
export function ApplyLeaveModal({ onBehalf, onClose }: { onBehalf?: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const types = useLeaveTypes();
  const staff = useStaffList({ status: 'ACTIVE' });
  const apply = useApplyLeave();
  const [staffId, setStaffId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [from, setFrom] = useState(todayText());
  const [to, setTo] = useState(todayText());
  const [reason, setReason] = useState('');
  const days = daysBetween(from, to);
  const valid = typeId !== '' && days >= 1 && days <= 90 && (!onBehalf || staffId !== '');
  const submit = async () => {
    if (!valid) return;
    try {
      await apply.mutateAsync({ leaveTypeId: typeId, fromDate: from, toDate: to, reason: reason.trim() || null, ...(onBehalf ? { staffId } : {}) });
      toast.success(t('leave.applied'));
      onClose();
    } catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={onBehalf ? t('leave.applyFor') : t('leave.apply')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={apply.isPending} disabled={!valid}>{t('leave.submit')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {onBehalf ? (
          <div className="sm:col-span-2">
            <Field id="lv-staff" label={t('leave.staff')}>
              <Select id="lv-staff" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                <option value="">{t('leave.chooseStaff')}</option>
                {(staff.data?.staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.employeeNo})</option>)}
              </Select>
            </Field>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <Field id="lv-type" label={t('leave.type')}>
            <Select id="lv-type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">{t('leave.chooseType')}</option>
              {(types.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}{x.paid ? '' : ` (${t('leave.unpaid')})`}</option>)}
            </Select>
          </Field>
        </div>
        <Field id="lv-from" label={t('leave.from')}><Input id="lv-from" type="date" dir="ltr" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} /></Field>
        <Field id="lv-to" label={t('leave.to')} error={from && to && days === 0 ? t('leave.rangeInvalid') : days > 90 ? t('leave.tooLong') : undefined}>
          <Input id="lv-to" type="date" dir="ltr" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <p className="text-sm text-muted sm:col-span-2" aria-live="polite">{days >= 1 ? t('leave.daysCount', { count: days }) : ''}</p>
        <div className="sm:col-span-2"><Field id="lv-reason" label={t('leave.reason')}><Input id="lv-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field></div>
      </div>
    </Modal>
  );
}

/** Approve or reject a request, with an optional note for the staff member. */
export function DecisionModal({ request, action, onClose }: { request: LeaveRequest; action: 'approve' | 'reject'; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const decide = useDecideLeave();
  const [note, setNote] = useState('');
  const submit = async () => {
    try {
      await decide.mutateAsync({ id: request.id, action, note: note.trim() || null });
      toast.success(t(action === 'approve' ? 'leave.approvedToast' : 'leave.rejectedToast'));
      onClose();
    } catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t(action === 'approve' ? 'leave.approveTitle' : 'leave.rejectTitle', { name: request.staff.name })}
      description={`${request.requestNo} · ${request.leaveType.name} · ${request.fromDate} ${rangeArrow()} ${request.toDate} (${t('leave.daysCount', { count: request.days })})`}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button variant={action === 'reject' ? 'danger' : 'primary'} onClick={() => void submit()} loading={decide.isPending}>{t(action === 'approve' ? 'leave.approve' : 'leave.reject')}</Button></>}>
      <Field id="lv-note" label={t('leave.note')}><Input id="lv-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}

export function LeaveTypeModal({ type, onClose }: { type?: LeaveType; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateLeaveType();
  const update = useUpdateLeaveType();
  const [name, setName] = useState(type?.name ?? '');
  const [quota, setQuota] = useState(type?.yearlyQuota != null ? String(type.yearlyQuota) : '');
  const [paid, setPaid] = useState(type?.paid ?? true);
  const q = parseQuota(quota);
  const valid = name.trim().length >= 2 && q !== undefined;
  const submit = async () => {
    if (!valid || q === undefined) return;
    const values = { name: name.trim(), yearlyQuota: q, paid };
    try {
      if (type) await update.mutateAsync({ id: type.id, patch: values }); else await create.mutateAsync(values);
      toast.success(t('leave.typeSaved'));
      onClose();
    } catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={type ? t('leave.editType') : t('leave.addType')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={create.isPending || update.isPending} disabled={!valid}>{t('leave.save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field id="lt-name" label={t('leave.typeName')}><Input id="lt-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></Field></div>
        <Field id="lt-quota" label={t('leave.yearlyQuota')} hint={t('leave.quotaHint')} error={q === undefined ? t('leave.quotaInvalid') : undefined}><Input id="lt-quota" dir="ltr" inputMode="numeric" value={quota} onChange={(e) => setQuota(e.target.value)} /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />{t('leave.paidType')}</label>
      </div>
    </Modal>
  );
}
