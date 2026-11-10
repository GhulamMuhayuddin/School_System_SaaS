import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { todayText } from '@/features/hr/hr-api';
import { platformError } from '@/features/platform/common';
import { useStudents } from '@/features/students/students-api';
import { CERT_TYPES, useIssueCertificate, useVoidCertificate, type Certificate, type CertType } from './certificates-api';

export function IssueModal({ onClose, onIssued }: { onClose: () => void; onIssued: (id: string) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const issue = useIssueCertificate();
  const [q, setQ] = useState('');
  const [studentId, setStudentId] = useState('');
  const [type, setType] = useState<CertType>('BONAFIDE');
  const [issuedOn, setIssuedOn] = useState(todayText());
  const [purpose, setPurpose] = useState('');
  const [remarks, setRemarks] = useState('');
  const search = q.trim();
  const students = useStudents({ q: search.length >= 2 ? search : undefined });
  const matches = search.length >= 2 ? (students.data?.students ?? []).slice(0, 30) : [];
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(issuedOn) && issuedOn <= todayText();
  const valid = studentId !== '' && dateOk;
  const submit = async () => {
    if (!valid) return;
    try {
      const d = await issue.mutateAsync({ studentId, type, issuedOn, purpose: purpose.trim() || null, remarks: remarks.trim() || null });
      toast.success(t('certificates.issued', { no: d.certificate.certNo }));
      onIssued(d.certificate.id);
      onClose();
    } catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  const purposeLabel = type === 'LEAVING' ? t('certificates.reasonLeaving') : t('certificates.purpose');
  const remarksLabel = type === 'CHARACTER' ? t('certificates.conduct') : t('certificates.remarks');
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('certificates.issueTitle')} description={t('certificates.issueHint')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={issue.isPending} disabled={!valid}>{t('certificates.issue')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field id="ct-search" label={t('certificates.findStudent')} hint={t('certificates.findHint')}><Input id="ct-search" value={q} onChange={(e) => { setQ(e.target.value); setStudentId(''); }} /></Field></div>
        {search.length >= 2 ? (
          <div className="sm:col-span-2">
            <Field id="ct-student" label={t('certificates.student')}>
              <Select id="ct-student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">{matches.length === 0 ? t('certificates.noMatch') : t('certificates.chooseStudent')}</option>
                {matches.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.admissionNo} — {s.class.name}{s.status !== 'ACTIVE' ? ` (${t(`certificates.studentStatus.${s.status}`)})` : ''}</option>)}
              </Select>
            </Field>
          </div>
        ) : null}
        <Field id="ct-type" label={t('certificates.type')}><Select id="ct-type" value={type} onChange={(e) => setType(e.target.value as CertType)}>{CERT_TYPES.map((x) => <option key={x} value={x}>{t(`certificates.types.${x}`)}</option>)}</Select></Field>
        <Field id="ct-date" label={t('certificates.issuedOn')} error={dateOk ? undefined : t('certificates.dateInvalid')}><Input id="ct-date" type="date" dir="ltr" value={issuedOn} max={todayText()} onChange={(e) => setIssuedOn(e.target.value)} /></Field>
        {type !== 'CHARACTER' ? <div className="sm:col-span-2"><Field id="ct-purpose" label={purposeLabel}><Input id="ct-purpose" value={purpose} maxLength={120} onChange={(e) => setPurpose(e.target.value)} /></Field></div> : null}
        {type !== 'BONAFIDE' ? <div className="sm:col-span-2"><Field id="ct-remarks" label={remarksLabel}><Input id="ct-remarks" value={remarks} maxLength={300} onChange={(e) => setRemarks(e.target.value)} /></Field></div> : null}
      </div>
    </Modal>
  );
}

export function VoidCertificateModal({ certificate, onClose }: { certificate: Certificate; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const voidIt = useVoidCertificate();
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= 3;
  const submit = async () => {
    if (!valid) return;
    try { await voidIt.mutateAsync({ id: certificate.id, reason: reason.trim() }); toast.success(t('certificates.voided')); onClose(); }
    catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('certificates.voidTitle', { no: certificate.certNo })} description={t('certificates.voidHint')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => void submit()} loading={voidIt.isPending} disabled={!valid}>{t('certificates.void')}</Button></>}>
      <Field id="ct-void" label={t('certificates.voidReason')}><Input id="ct-void" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}
