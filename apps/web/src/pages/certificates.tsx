import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input, Select } from '@/components/ui/input';
import { useAuth } from '@/features/auth/auth-context';
import { CERT_TYPES, certTone, useCertificates, type Certificate, type CertType } from '@/features/certificates/certificates-api';
import { IssueModal, VoidCertificateModal } from '@/features/certificates/certificates-modals';
import { PageHeader, fmtDate, platformError } from '@/features/platform/common';

export default function CertificatesPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [type, setType] = useState<CertType | ''>('');
  const [status, setStatus] = useState<'VALID' | 'VOID' | ''>('');
  const [q, setQ] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [voiding, setVoiding] = useState<Certificate | null>(null);
  const list = useCertificates({ type: type || undefined, status: status || undefined, q: q.trim() || undefined });
  const issueRight = can('certificate.issue');
  const columns: Column<Certificate>[] = [
    { key: 'no', header: t('certificates.number'), sortValue: (c) => c.certNo, cell: (c) => <span dir="ltr" className="font-semibold">{c.certNo}</span> },
    { key: 'student', header: t('certificates.student'), sortValue: (c) => c.studentName, cell: (c) => <span>{c.studentName}<span className="block text-xs text-muted"><span dir="ltr">{c.admissionNo}</span> · {c.className}</span></span> },
    { key: 'type', header: t('certificates.type'), sortValue: (c) => c.type, cell: (c) => t(`certificates.types.${c.type}`) },
    { key: 'date', header: t('certificates.issuedOn'), sortValue: (c) => c.issuedOn, cell: (c) => <span>{fmtDate(c.issuedOn, i18n.language)}{c.issuedBy ? <span className="block text-xs text-muted">{c.issuedBy}</span> : null}</span> },
    { key: 'status', header: t('certificates.status'), sortValue: (c) => c.status, cell: (c) => <span><Badge tone={certTone(c.status)}>{t(`certificates.statuses.${c.status}`)}</Badge>{c.voidReason ? <span className="block text-xs text-muted">{c.voidReason}</span> : null}</span> },
    { key: 'x', header: '', sortValue: () => '', cell: (c) => (
      <span className="flex gap-1">
        <Link to={`/app/certificates/${c.id}/print`} className="rounded-control px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">{t('certificates.printView')}</Link>
        {issueRight && c.status === 'VALID' ? <Button size="sm" variant="ghost" onClick={() => setVoiding(c)}>{t('certificates.void')}</Button> : null}
      </span>) },
  ];
  return (
    <div className="space-y-5">
      <PageHeader title={t('certificates.title')} subtitle={t('certificates.subtitle')} />
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-48"><label htmlFor="cr-q" className="mb-1 block text-sm font-medium text-navy-900">{t('certificates.search')}</label><Input id="cr-q" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="min-w-44"><Field id="cr-type" label={t('certificates.type')}><Select id="cr-type" value={type} onChange={(e) => setType(e.target.value as CertType | '')}><option value="">{t('certificates.all')}</option>{CERT_TYPES.map((x) => <option key={x} value={x}>{t(`certificates.types.${x}`)}</option>)}</Select></Field></div>
        <div className="min-w-36"><Field id="cr-status" label={t('certificates.status')}><Select id="cr-status" value={status} onChange={(e) => setStatus(e.target.value as 'VALID' | 'VOID' | '')}><option value="">{t('certificates.all')}</option><option value="VALID">{t('certificates.statuses.VALID')}</option><option value="VOID">{t('certificates.statuses.VOID')}</option></Select></Field></div>
        {issueRight ? <Button onClick={() => setIssuing(true)}><Plus className="size-4" aria-hidden />{t('certificates.issueTitle')}</Button> : null}
      </div>
      <DataTable columns={columns} rows={list.data?.certificates ?? []} rowKey={(c) => c.id} pageSize={15} searchText={(c) => `${c.certNo} ${c.studentName} ${c.admissionNo}`}
        loading={list.isLoading} error={list.error ? platformError(t, list.error) : null} onRetry={() => void list.refetch()}
        emptyTitle={t('certificates.emptyTitle')} emptyDescription={t('certificates.emptyBody')} />
      {list.data?.truncated ? <p className="text-xs text-muted">{t('certificates.truncated')}</p> : null}
      {issuing ? <IssueModal onClose={() => setIssuing(false)} onIssued={(id) => navigate(`/app/certificates/${id}/print`)} /> : null}
      {voiding ? <VoidCertificateModal certificate={voiding} onClose={() => setVoiding(null)} /> : null}
    </div>
  );
}
