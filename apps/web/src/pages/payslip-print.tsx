import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { PrintFrame, SchoolLetterhead, type PrintLang } from '@/components/print/print-frame';
import { ErrorState, Spinner } from '@/components/ui/states';
import { fmtMoney } from '@/features/fees/fees-api';
import { periodLabel, usePayslipDetail } from '@/features/hr/hr-api';
import { fmtDate, platformError } from '@/features/platform/common';

/** A printable salary slip. `?own=1` fetches the signed-in staff member's own slip; otherwise HR / accounts open it by id. */
export default function PayslipPrintPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const own = params.get('own') === '1';
  const { t, i18n } = useTranslation();
  const [lang, setLang] = useState<PrintLang>(i18n.language === 'ur' ? 'ur' : 'en');
  const one = usePayslipDetail(id, own);
  if (one.isLoading) return <Spinner />;
  if (one.error || !one.data) return <ErrorState title={t('platform.errors.generic')} description={one.error ? platformError(t, one.error) : undefined} onRetry={() => void one.refetch()} />;
  const { payslip: s, school } = one.data;
  const tt = i18n.getFixedT(lang) as unknown as (key: string, options?: Record<string, unknown>) => string;
  const money = (n: number) => <span dir="ltr">{fmtMoney(n, lang)}</span>;
  const totalDeductions = s.fixedDeduction + s.attendanceDeduction + s.otherDeduction;
  const row = (label: string, value: number, bold = false) => (
    <tr className={bold ? 'border-t-2 border-black font-bold' : 'border-t border-gray-300'}><td className="py-1.5 pe-4">{label}</td><td className="py-1.5 text-end">{money(value)}</td></tr>
  );
  return (
    <PrintFrame lang={lang} onLang={setLang} backTo={own ? '/app/my-payslips' : '/app/payroll'}>
      <SchoolLetterhead school={school} />
      <h2 className="mt-6 text-center text-xl font-extrabold">{tt('print.payslip.title')} — {periodLabel(s.period, lang)}</h2>
      <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
        <div className="flex justify-between"><dt className="text-gray-600">{tt('print.payslip.employee')}</dt><dd className="font-semibold">{s.staff.name}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-600">{tt('print.payslip.slipNo')}</dt><dd className="font-semibold" dir="ltr">{s.slipNo}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-600">{tt('print.payslip.employeeNo')}</dt><dd className="font-semibold" dir="ltr">{s.staff.employeeNo}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-600">{tt('print.payslip.designation')}</dt><dd className="font-semibold">{s.staff.designation}</dd></div>
      </dl>
      <div className="mt-6 grid grid-cols-2 gap-8 text-sm">
        <section><h3 className="mb-1 font-bold">{tt('print.payslip.earnings')}</h3><table className="w-full"><tbody>
          {row(tt('print.payslip.basic'), s.basic)}{row(tt('print.payslip.allowances'), s.allowances)}{s.bonus > 0 ? row(tt('print.payslip.bonus'), s.bonus) : null}{row(tt('print.payslip.grossPay'), s.gross + s.bonus, true)}
        </tbody></table></section>
        <section><h3 className="mb-1 font-bold">{tt('print.payslip.deductions')}</h3><table className="w-full"><tbody>
          {row(tt('print.payslip.fixed'), s.fixedDeduction)}{row(tt('print.payslip.attendance', { days: s.deductionDays }), s.attendanceDeduction)}{row(tt('print.payslip.other'), s.otherDeduction)}{row(tt('print.payslip.totalDeductions'), totalDeductions, true)}
        </tbody></table></section>
      </div>
      <p className="mt-6 flex items-center justify-between rounded-card border-2 border-black p-4 text-xl font-extrabold"><span>{tt('print.payslip.net')}</span>{money(s.net)}</p>
      {s.note ? <p className="mt-3 text-sm"><b>{tt('print.payslip.note')}:</b> {s.note}</p> : null}
      <p className="mt-3 text-sm">{s.paid && s.paidOn ? tt('print.payslip.paid', { date: fmtDate(s.paidOn, lang), method: s.method ? tt(`print.payslip.methods.${s.method}`) : '' }) : tt('print.payslip.notPaid')}</p>
      <div className="mt-20 flex justify-between text-sm"><span className="border-t border-black px-6 pt-1">{tt('print.payslip.signEmployee')}</span><span className="border-t border-black px-6 pt-1">{tt('print.payslip.signAccounts')}</span></div>
      <p className="mt-8 text-center text-xs text-gray-500">{tt('print.payslip.computer')}</p>
    </PrintFrame>
  );
}
