import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { fmtMoney } from '@/features/fees/fees-api';
import { fmtDate, platformError } from '@/features/platform/common';
import { useStudents } from '@/features/students/students-api';
import { loanTone, useIssue, useLoans, useRenewLoan, useReturnLoan, useSettleFine, type Loan, type LoanStatusFilter } from './library-api';

/** Issue desk: scan or type the accession number, pick the student. The server checks every rule (limit, overdue, unpaid fine, availability). */
export function IssueModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const issue = useIssue();
  const [accession, setAccession] = useState('');
  const [search, setSearch] = useState('');
  const [studentId, setStudentId] = useState('');
  const students = useStudents({ q: search.trim().length >= 2 ? search.trim() : undefined, status: 'ACTIVE' });
  const options = search.trim().length >= 2 ? (students.data?.students ?? []).slice(0, 30) : [];
  const valid = accession.trim().length > 0 && studentId !== '';
  const submit = async () => {
    try {
      const loan = await issue.mutateAsync({ accessionNo: accession.trim(), studentId });
      toast.success(t('library.issued'), t('library.issuedDue', { date: fmtDate(loan.dueOn, i18n.language) }));
      onClose();
    } catch (err) { toast.error(t('platform.errors.generic'), platformError(t, err)); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('library.issueBook')} description={t('library.issueNote')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={issue.isPending} disabled={!valid}>{t('library.issue')}</Button></>}>
      <div className="space-y-4">
        <Field id="is-acc" label={t('library.accessionNo')}><Input id="is-acc" dir="ltr" autoFocus placeholder="LIB-000001" value={accession} onChange={(e) => setAccession(e.target.value)} /></Field>
        <Field id="is-search" label={t('library.findStudent')} hint={t('library.findStudentHint')}><Input id="is-search" value={search} onChange={(e) => { setSearch(e.target.value); setStudentId(''); }} /></Field>
        {options.length > 0 && (
          <Field id="is-student" label={t('library.student')}>
            <Select id="is-student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">{t('library.chooseStudent')}</option>
              {options.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} · {s.admissionNo}</option>)}
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

export function LoansTab() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<LoanStatusFilter>('open');
  const [issuing, setIssuing] = useState(false);
  const loans = useLoans({ status });
  const ret = useReturnLoan(); const renew = useRenewLoan(); const fine = useSettleFine();
  const desk = can('library.issue');
  const fail = (err: unknown) => toast.error(t('platform.errors.generic'), platformError(t, err));
  const columns: Column<Loan>[] = [
    { key: 'book', header: t('library.book'), sortValue: (l) => l.book.title, cell: (l) => <span><b className="text-navy-900">{l.book.title}</b><span dir="ltr" className="block text-xs text-muted">{l.copy.accessionNo}</span></span> },
    { key: 'student', header: t('library.student'), sortValue: (l) => l.student.name, cell: (l) => <span>{l.student.name}<span className="block text-xs text-muted">{l.student.className ?? ''} · <span dir="ltr">{l.student.admissionNo}</span></span></span> },
    { key: 'issued', header: t('library.issuedOn'), sortValue: (l) => l.issuedOn, cell: (l) => fmtDate(l.issuedOn, i18n.language) },
    { key: 'due', header: t('library.dueLabel'), sortValue: (l) => l.dueOn, cell: (l) => fmtDate(l.dueOn, i18n.language) },
    { key: 'state', header: t('library.stateLabel'), sortValue: (l) => l.state, cell: (l) => <Badge tone={loanTone(l.state)}>{l.state === 'OVERDUE' ? t('library.overdueDays', { count: l.overdueDays }) : t(`library.state.${l.state}`)}</Badge> },
    { key: 'fine', header: t('library.fine'), sortValue: (l) => l.fine, cell: (l) => (l.fine > 0 ? <span dir="ltr">{fmtMoney(l.fine, i18n.language)} <Badge tone={l.fineStatus === 'UNPAID' ? 'danger' : 'neutral'}>{t(`library.fineStatus.${l.fineStatus}`)}</Badge></span> : '—') },
    {
      key: 'actions', header: '', cell: (l) => !desk ? null : (
        <span className="flex flex-wrap gap-1">
          {l.state !== 'RETURNED' && <Button size="sm" variant="secondary" onClick={() => ret.mutate(l.id, { onSuccess: (r) => toast.success(t('library.returned'), r.fine > 0 ? t('library.fineAdded', { amount: fmtMoney(r.fine, i18n.language) }) : undefined), onError: fail })}>{t('library.return')}</Button>}
          {l.state === 'OPEN' && l.renewals < 2 && <Button size="sm" variant="secondary" onClick={() => renew.mutate(l.id, { onError: fail })}>{t('library.renew')}</Button>}
          {l.fineStatus === 'UNPAID' && l.state === 'RETURNED' && <>
            <Button size="sm" onClick={() => fine.mutate({ id: l.id, action: 'PAID' }, { onError: fail })}>{t('library.finePaid')}</Button>
            <Button size="sm" variant="secondary" onClick={() => fine.mutate({ id: l.id, action: 'WAIVED' }, { onError: fail })}>{t('library.fineWaive')}</Button>
          </>}
        </span>
      ),
    },
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Field id="ln-status" label={t('library.show')}>
          <Select id="ln-status" value={status} onChange={(e) => setStatus(e.target.value as LoanStatusFilter)}>
            {(['open', 'overdue', 'returned', 'all'] as const).map((s) => <option key={s} value={s}>{t(`library.filter.${s}`)}</option>)}
          </Select>
        </Field>
        {desk && <Button onClick={() => setIssuing(true)}>{t('library.issueBook')}</Button>}
      </div>
      <DataTable columns={columns} rows={loans.data?.loans ?? []} rowKey={(l) => l.id} pageSize={15} searchText={(l) => `${l.book.title} ${l.copy.accessionNo} ${l.student.name} ${l.student.admissionNo}`}
        loading={loans.isLoading} error={loans.error ? platformError(t, loans.error) : null} onRetry={() => void loans.refetch()} emptyTitle={t('library.loansEmptyTitle')} emptyDescription={t('library.loansEmptyBody')} />
      {loans.data?.truncated ? <p className="mt-2 text-xs text-muted">{t('library.truncated')}</p> : null}
      {issuing ? <IssueModal onClose={() => setIssuing(false)} /> : null}
    </div>
  );
}
