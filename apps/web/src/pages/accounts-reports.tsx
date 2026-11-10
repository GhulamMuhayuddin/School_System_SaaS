import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input } from '@/components/ui/input';
import { fmtMoney, monthStartText, todayText, useAccountSummary, useMonthly, type CategoryTotal, type MonthRow } from '@/features/accounts/accounts-api';
import { AccountsTabs } from '@/features/accounts/accounts-tabs';
import { PageHeader, platformError } from '@/features/platform/common';

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <Card className="p-4"><p className="text-sm text-muted">{label}</p><p dir="ltr" className={`mt-1 text-xl font-bold ${tone ?? 'text-navy-900'}`}>{value}</p></Card>;
}

function Breakdown({ title, rows, money }: { title: string; rows: CategoryTotal[]; money: (n: number) => string }) {
  const { t } = useTranslation();
  return (
    <Card className="p-5">
      <h2 className="mb-3 font-semibold text-navy-900">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-muted">{t('accounts.nothingInRange')}</p> : (
        <ul className="divide-y divide-line text-sm">
          {rows.map((r) => <li key={r.categoryId} className="flex justify-between py-2"><span>{r.name} <span className="text-muted">({r.entries})</span></span><span dir="ltr" className="font-semibold">{money(r.amount)}</span></li>)}
        </ul>
      )}
    </Card>
  );
}

export default function AccountsReportsPage() {
  const { t, i18n } = useTranslation();
  const [from, setFrom] = useState(monthStartText());
  const [to, setTo] = useState(todayText());
  const [year, setYear] = useState(todayText().slice(0, 4));
  const bad = Boolean(from && to && to < from);
  const yearOk = /^\d{4}$/.test(year) && Number(year) >= 2000 && Number(year) <= 2100;
  const summary = useAccountSummary(bad ? '' : from, bad ? '' : to);
  const monthly = useMonthly(yearOk ? year : '');
  const m = (n: number) => fmtMoney(n, i18n.language);
  const s = summary.data;
  const columns: Column<MonthRow>[] = [
    { key: 'month', header: t('accounts.month'), sortValue: (r) => r.month, cell: (r) => <span dir="ltr">{r.month}</span> },
    { key: 'fee', header: t('accounts.feeIncome'), sortValue: (r) => r.feeIncome, cell: (r) => <span dir="ltr">{m(r.feeIncome)}</span> },
    { key: 'other', header: t('accounts.otherIncome'), sortValue: (r) => r.otherIncome, cell: (r) => <span dir="ltr">{m(r.otherIncome)}</span> },
    { key: 'exp', header: t('accounts.expense'), sortValue: (r) => r.expenses, cell: (r) => <span dir="ltr">{m(r.expenses)}</span> },
    { key: 'net', header: t('accounts.net'), sortValue: (r) => r.net, cell: (r) => <span dir="ltr" className={r.net < 0 ? 'font-semibold text-rose-700' : 'font-semibold'}>{m(r.net)}</span> },
  ];
  return (
    <div>
      <PageHeader title={t('accounts.title')} subtitle={t('accounts.reportsSubtitle')} />
      <AccountsTabs />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        <Field id="r-from" label={t('accounts.from')}><Input id="r-from" type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field id="r-to" label={t('accounts.to')} error={bad ? t('attendance.rangeInvalid') : undefined}><Input id="r-to" type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      {summary.error ? <p className="mb-4 text-sm text-rose-700">{platformError(t, summary.error)}</p> : null}
      {s ? (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label={t('accounts.feeIncome')} value={m(s.feeIncome)} />
            <Stat label={t('accounts.otherIncome')} value={m(s.otherIncome)} />
            <Stat label={t('accounts.totalIncome')} value={m(s.totalIncome)} tone="text-emerald-700" />
            <Stat label={t('accounts.expense')} value={m(s.expenses)} />
            <Stat label={t('accounts.net')} value={m(s.net)} tone={s.net < 0 ? 'text-rose-700' : 'text-navy-900'} />
          </div>
          <div className="mb-8 grid gap-5 lg:grid-cols-2">
            <Breakdown title={t('accounts.incomeByCategory')} rows={s.incomeByCategory} money={m} />
            <Breakdown title={t('accounts.expenseByCategory')} rows={s.expenseByCategory} money={m} />
          </div>
        </>
      ) : null}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-semibold text-navy-900">{t('accounts.monthlyTitle')}</h2>
        <div className="w-32"><Field id="r-year" label={t('accounts.year')} error={yearOk ? undefined : t('accounts.yearInvalid')}><Input id="r-year" inputMode="numeric" dir="ltr" maxLength={4} value={year} onChange={(e) => setYear(e.target.value)} /></Field></div>
      </div>
      <DataTable columns={columns} rows={monthly.data?.months ?? []} rowKey={(r) => r.month} pageSize={12}
        loading={yearOk && monthly.isLoading} error={monthly.error ? platformError(t, monthly.error) : null} onRetry={() => void monthly.refetch()} emptyTitle={t('accounts.nothingInRange')} />
    </div>
  );
}
