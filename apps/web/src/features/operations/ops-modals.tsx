import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { platformError } from '@/features/platform/common';
import {
  CATEGORIES, PRIORITIES, SOURCES, phoneOk, resolutionOk, useCheckIn, useCreateComplaint, useSetComplaintStatus, useUpdateVisit,
  type Complaint, type ComplaintCategory, type ComplaintPriority, type ComplaintSource, type ComplaintStatus, type Visit,
} from './ops-api';

export function VisitFormModal({ visit, onClose }: { visit?: Visit; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const checkIn = useCheckIn();
  const update = useUpdateVisit();
  const [name, setName] = useState(visit?.name ?? '');
  const [phone, setPhone] = useState(visit?.phone ?? '');
  const [purpose, setPurpose] = useState(visit?.purpose ?? '');
  const [visiting, setVisiting] = useState(visit?.visiting ?? '');
  const [notes, setNotes] = useState(visit?.notes ?? '');
  const valid = name.trim().length >= 2 && purpose.trim().length >= 2 && phoneOk(phone);
  const submit = async () => {
    if (!valid) return;
    const values = { name: name.trim(), phone: phone.trim() || null, purpose: purpose.trim(), visiting: visiting.trim() || null, notes: notes.trim() || null };
    try {
      if (visit) await update.mutateAsync({ id: visit.id, patch: values }); else await checkIn.mutateAsync(values);
      toast.success(t(visit ? 'visitors.saved' : 'visitors.checkedIn'));
      onClose();
    } catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={visit ? t('visitors.editVisit') : t('visitors.checkInTitle')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={checkIn.isPending || update.isPending} disabled={!valid}>{visit ? t('visitors.save') : t('visitors.checkIn')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="vs-name" label={t('visitors.name')}><Input id="vs-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
        <Field id="vs-phone" label={t('visitors.phone')} error={phoneOk(phone) ? undefined : t('visitors.phoneInvalid')}><Input id="vs-phone" dir="ltr" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field id="vs-purpose" label={t('visitors.purpose')}><Input id="vs-purpose" value={purpose} maxLength={120} onChange={(e) => setPurpose(e.target.value)} /></Field>
        <Field id="vs-visiting" label={t('visitors.visiting')}><Input id="vs-visiting" value={visiting} maxLength={80} onChange={(e) => setVisiting(e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field id="vs-notes" label={t('visitors.notes')}><Input id="vs-notes" value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} /></Field></div>
      </div>
    </Modal>
  );
}

export function ComplaintFormModal({ onClose, onCreated }: { onClose: () => void; onCreated?: (id: string) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateComplaint();
  const [source, setSource] = useState<ComplaintSource>('PARENT');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState<ComplaintCategory>('OTHER');
  const [priority, setPriority] = useState<ComplaintPriority>('NORMAL');
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const valid = name.trim().length >= 2 && subject.trim().length >= 3 && details.trim().length >= 3 && phoneOk(phone);
  const submit = async () => {
    if (!valid) return;
    try {
      const d = await create.mutateAsync({ source, name: name.trim(), phone: phone.trim() || null, category, subject: subject.trim(), details: details.trim(), priority });
      toast.success(t('complaints.logged'));
      onCreated?.(d.complaint.id);
      onClose();
    } catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('complaints.logTitle')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={create.isPending} disabled={!valid}>{t('complaints.log')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="cp-source" label={t('complaints.source')}><Select id="cp-source" value={source} onChange={(e) => setSource(e.target.value as ComplaintSource)}>{SOURCES.map((s) => <option key={s} value={s}>{t(`complaints.sources.${s}`)}</option>)}</Select></Field>
        <Field id="cp-name" label={t('complaints.complainant')}><Input id="cp-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
        <Field id="cp-phone" label={t('visitors.phone')} error={phoneOk(phone) ? undefined : t('visitors.phoneInvalid')}><Input id="cp-phone" dir="ltr" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field id="cp-cat" label={t('complaints.category')}><Select id="cp-cat" value={category} onChange={(e) => setCategory(e.target.value as ComplaintCategory)}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`complaints.categories.${c}`)}</option>)}</Select></Field>
        <Field id="cp-prio" label={t('complaints.priority')}><Select id="cp-prio" value={priority} onChange={(e) => setPriority(e.target.value as ComplaintPriority)}>{PRIORITIES.map((p) => <option key={p} value={p}>{t(`complaints.priorities.${p}`)}</option>)}</Select></Field>
        <div className="sm:col-span-2"><Field id="cp-subject" label={t('complaints.subject')}><Input id="cp-subject" value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field id="cp-details" label={t('complaints.details')}><Textarea id="cp-details" rows={4} value={details} maxLength={2000} onChange={(e) => setDetails(e.target.value)} /></Field></div>
      </div>
    </Modal>
  );
}

/** Move a complaint to another status. Resolving asks how it was resolved; the other moves only confirm. */
export function StatusModal({ complaint, status, onClose }: { complaint: Complaint; status: ComplaintStatus; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const set = useSetComplaintStatus();
  const [resolution, setResolution] = useState(complaint.resolution ?? '');
  const needs = status === 'RESOLVED';
  const valid = !needs || resolutionOk(resolution);
  const submit = async () => {
    if (!valid) return;
    try { await set.mutateAsync({ id: complaint.id, status, resolution: needs ? resolution.trim() : null }); toast.success(t('complaints.statusSaved')); onClose(); }
    catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('complaints.moveTo', { status: t(`complaints.statuses.${status}`) })} description={`${complaint.complaintNo} · ${complaint.subject}`}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={set.isPending} disabled={!valid}>{t('complaints.confirm')}</Button></>}>
      {needs ? <Field id="cp-resolution" label={t('complaints.resolution')} hint={t('complaints.resolutionHint')}><Textarea id="cp-resolution" rows={3} value={resolution} maxLength={1000} onChange={(e) => setResolution(e.target.value)} /></Field> : <p className="text-sm text-muted">{t('complaints.moveHint')}</p>}
    </Modal>
  );
}
