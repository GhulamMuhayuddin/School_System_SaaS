import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/data-table';
import { fmtMoney } from '@/features/fees/fees-api';
import { periodLabel, useMyPayslips, type Payslip } from '@/features/hr/hr-api';
import { PageHeader, platformError } from '@/features/platform/common';

/** The signed-in staff member's own finalized payslips. Everyone else simply sees an empty list. */
export default function MyPayslipsPage() {
  const { t, i18n } = useTranslation();
  const slips = useMyPayslips();
  const money = (n: number) => <span dir="ltr">{fmtMoney(n, i18n.language)}</span>;
  const columns: Column<Payslip>[] = [
    { key: 'period', header: t('payroll.month'), sortValue: (s) => s.period, cell: (s) => <span>{periodLabel(s.period, i18n.language)}<span className="block text-xs text-muted" dir="ltr">{s.slipNo}</span></span> },
    { key: 'gross', header: t('payroll.gross'), sortValue: (s) => s.gross, cell: (s) => money(s.gross) },
    { key: 'days', header: t('payroll.unpaidDays'), sortValue: (s) => s.deductionDays, cell: (s) => <span dir="ltr">{s.deductionDays}</span> },
    { key: 'ded', header: t('payroll.deductions'), sortValue: (s) => s.fixedDeduction + s.attendanceDeduction + s.otherDeduction, cell: (s) => money(s.fixedDeduction + s.attendanceDeduction + s.otherDeduction) },
    { key: 'bonus', header: t('payroll.bonus'), sortValue: (s) => s.bonus, cell: (s) => money(s.bonus) },
    { key: 'net', header: t('payroll.net'), sortValue: (s) => s.net, cell: (s) => <b>{money(s.net)}</b> },
    { key: 'paid', header: t('payroll.status'), sortValue: (s) => (s.paid ? 1 : 0), cell: (s) => <Badge tone={s.paid ? 'success' : 'warning'}>{s.paid ? t('payroll.paidStatus') : t('payroll.unpaidStatus')}</Badge> },
    { key: 'print', header: '', sortValue: () => '', cell: (s) => <Link to={`/app/payslips/${s.id}/print?own=1`} className="rounded-control px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">{t('payroll.printSlip')}</Link> },
  ];
  return (
    <div className="space-y-5">
      <PageHeader title={t('payroll.myTitle')} subtitle={t('payroll.mySubtitle')} />
      <DataTable columns={columns} rows={slips.data ?? []} rowKey={(s) => s.id} pageSize={12} searchText={(s) => `${s.period} ${s.slipNo}`}
        loading={slips.isLoading} error={slips.error ? platformError(t, slips.error) : null} onRetry={() => void slips.refetch()}
        emptyTitle={t('payroll.myEmptyTitle')} emptyDescription={t('payroll.myEmptyBody')} />
    </div>
  );
}
