import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { PrintFrame, PrintPage, SchoolLetterhead, type Letterhead, type PrintLang } from '@/components/print/print-frame';
import { ErrorState, Spinner } from '@/components/ui/states';
import { fmtMoney, useVoucher, useVouchers, type Payment, type VoucherDetail, type VoucherStatus } from '@/features/fees/fees-api';
import { periodLabel } from '@/features/hr/hr-api';
import { fmtDate, platformError } from '@/features/platform/common';
import { BULK_VOUCHER_LIMIT, useLetterhead, usePayment, useVoucherDetails, type PrintT } from '@/features/print/print-api';

export function VoucherCopy({ school, v, tt, lang, copy }: { school: Letterhead; v: VoucherDetail; tt: PrintT; lang: PrintLang; copy: 'school' | 'parent' }) {
  const money = (n: number) => <span dir="ltr">{fmtMoney(n, lang)}</span>;
  const live = v.payments.filter((p) => !p.voided);
  return (
    <div className="print-avoid relative">
      <SchoolLetterhead school={school} />
      <p className="mt-2 flex items-center justify-between text-sm"><b className="text-base">{tt('print.voucher.title')} — {periodLabel(v.period, lang)}</b><span className="rounded border border-black px-2 py-0.5 text-xs font-bold">{tt(`print.voucher.copy.${copy}`)}</span></p>
      {v.status === 'CANCELLED' ? <p className="mt-1 text-center text-lg font-extrabold tracking-widest text-gray-500">{tt('print.voucher.cancelled')}</p> : null}
      <dl className="mt-2 grid grid-cols-2 gap-x-8 gap-y-0.5 text-sm">
        <div className="flex justify-between"><dt className="text-gray-600">{tt('print.voucher.voucherNo')}</dt><dd className="font-semibold" dir="ltr">{v.voucherNo}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-600">{tt('print.voucher.dueDate')}</dt><dd className="font-semibold">{fmtDate(v.dueDate, lang)}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-600">{tt('print.voucher.student')}</dt><dd className="font-semibold">{v.student.name}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-600">{tt('print.voucher.admissionNo')}</dt><dd className="font-semibold" dir="ltr">{v.student.admissionNo}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-600">{tt('print.voucher.class')}</dt><dd className="font-semibold">{v.className}{v.sectionName ? ` – ${v.sectionName}` : ''}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-600">{tt('print.voucher.status')}</dt><dd className="font-semibold">{tt(`print.voucher.statuses.${v.status}`)}</dd></div>
      </dl>
      <table className="mt-2 w-full border-collapse text-sm">
        <tbody>
          {v.items.map((i) => <tr key={i.id} className="border-b border-gray-300"><td className="py-1 pe-4">{i.description}</td><td className="py-1 text-end">{money(i.amount)}</td></tr>)}
          {v.discountAmount > 0 ? <tr className="border-b border-gray-300"><td className="py-1 pe-4">{tt('print.voucher.discount')}</td><td className="py-1 text-end">{money(-v.discountAmount)}</td></tr> : null}
          <tr className="border-t-2 border-black font-bold"><td className="py-1 pe-4">{tt('print.voucher.net')}</td><td className="py-1 text-end">{money(v.netAmount)}</td></tr>
          <tr><td className="py-1 pe-4">{tt('print.voucher.paid')}</td><td className="py-1 text-end">{money(v.paidAmount)}</td></tr>
          <tr className="font-extrabold"><td className="py-1 pe-4 text-base">{tt('print.voucher.balance')}</td><td className="py-1 text-end text-base">{money(v.balance)}</td></tr>
        </tbody>
      </table>
      {live.length > 0 ? <p className="mt-1 text-xs text-gray-700">{tt('print.voucher.received')}: {live.map((p) => `${p.receiptNo} (${fmtDate(p.paidAt, lang)}, ${fmtMoney(p.amount, lang)})`).join(' · ')}</p> : null}
      <p className="mt-6 flex justify-between text-xs"><span className="border-t border-black px-6 pt-1">{tt('print.voucher.signAccounts')}</span><span className="text-gray-500">{tt('print.voucher.computer')}</span></p>
    </div>
  );
}

/** One voucher, printed twice on the page (school copy and parent copy) with a cutting line between them. */
function VoucherPage({ school, v, tt, lang }: { school: Letterhead; v: VoucherDetail; tt: PrintT; lang: PrintLang }) {
  return (
    <PrintPage>
      <VoucherCopy school={school} v={v} tt={tt} lang={lang} copy="school" />
      <div className="my-6 border-t-2 border-dashed border-gray-400" aria-hidden />
      <VoucherCopy school={school} v={v} tt={tt} lang={lang} copy="parent" />
    </PrintPage>
  );
}

export function VoucherPrintPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const [lang, setLang] = useState<PrintLang>(i18n.language === 'ur' ? 'ur' : 'en');
  const v = useVoucher(id);
  const school = useLetterhead();
  const err = v.error ?? school.error;
  if (err) return <ErrorState title={t('platform.errors.generic')} description={platformError(t, err)} onRetry={() => { void v.refetch(); void school.refetch(); }} />;
  if (!v.data || !school.data) return <Spinner />;
  return (
    <PrintFrame lang={lang} onLang={setLang} backTo="/app/fees" sheets>
      <VoucherPage school={school.data} v={v.data} tt={i18n.getFixedT(lang) as unknown as PrintT} lang={lang} />
    </PrintFrame>
  );
}

/** Every voucher matching the filter of the vouchers page (?period, ?classId, ?status, ?overdue=1), one page each. */
export function VouchersBulkPrintPage() {
  const [params] = useSearchParams();
  const { t, i18n } = useTranslation();
  const [lang, setLang] = useState<PrintLang>(i18n.language === 'ur' ? 'ur' : 'en');
  const list = useVouchers({ classId: params.get('classId') ?? '', status: (params.get('status') ?? '') as VoucherStatus | '', period: params.get('period') ?? '', overdue: params.get('overdue') === '1' });
  const school = useLetterhead();
  const printable = (list.data ?? []).filter((v) => v.status !== 'CANCELLED');
  const ids = printable.slice(0, BULK_VOUCHER_LIMIT).map((v) => v.id);
  const details = useVoucherDetails(ids);
  const err = list.error ?? school.error ?? details.find((d) => d.error)?.error;
  if (err) return <ErrorState title={t('platform.errors.generic')} description={platformError(t, err)} onRetry={() => { void list.refetch(); void school.refetch(); details.forEach((d) => void d.refetch()); }} />;
  if (!list.data || !school.data || details.some((d) => d.isLoading)) return <Spinner />;
  const tt = i18n.getFixedT(lang) as unknown as PrintT;
  return (
    <PrintFrame lang={lang} onLang={setLang} backTo="/app/fees" sheets>
      {printable.length > BULK_VOUCHER_LIMIT ? <p className="no-print rounded-card bg-amber-50 p-4 text-sm font-semibold text-amber-800">{t('print.voucher.limit', { shown: BULK_VOUCHER_LIMIT, total: printable.length })}</p> : null}
      {printable.length === 0 ? <p className="no-print rounded-card bg-white p-4 text-sm text-muted">{t('print.voucher.none')}</p> : null}
      {details.map((d) => (d.data ? <VoucherPage key={d.data.id} school={school.data} v={d.data} tt={tt} lang={lang} /> : null))}
    </PrintFrame>
  );
}

export function ReceiptSheet({ school, p, tt, lang }: { school: Letterhead; p: Payment; tt: PrintT; lang: PrintLang }) {
  return (
    <>
      <SchoolLetterhead school={school} />
      <h2 className="mt-5 text-center text-xl font-extrabold">{tt('print.receipt.title')}</h2>
      {p.voided ? <p className="mt-2 text-center text-xl font-extrabold tracking-widest text-rose-700">{tt('print.receipt.voided')}{p.voidReason ? ` — ${p.voidReason}` : ''}</p> : null}
      <dl className="mt-5 space-y-1.5 text-sm">
        {([
          ['receiptNo', <span dir="ltr" key="r">{p.receiptNo}</span>], ['date', fmtDate(p.paidAt, lang)], ['student', p.student.name], ['admissionNo', <span dir="ltr" key="a">{p.student.admissionNo}</span>],
          ['voucherNo', <span dir="ltr" key="v">{p.voucherNo}</span>], ['period', periodLabel(p.period, lang)], ['method', tt(`print.receipt.methods.${p.method}`)], ...(p.reference ? [['reference', <span dir="ltr" key="f">{p.reference}</span>] as const] : []),
        ] as const).map(([k, v]) => <div key={k} className="flex justify-between border-b border-gray-300 pb-1"><dt className="text-gray-600">{tt(`print.receipt.${k}`)}</dt><dd className="font-semibold">{v}</dd></div>)}
      </dl>
      <p className="mt-6 flex items-center justify-between rounded-card border-2 border-black p-4 text-xl font-extrabold"><span>{tt('print.receipt.amount')}</span><span dir="ltr">{fmtMoney(p.amount, lang)}</span></p>
      <div className="mt-16 flex justify-between text-sm"><span className="border-t border-black px-6 pt-1">{tt('print.receipt.signPayer')}</span><span className="border-t border-black px-6 pt-1">{tt('print.receipt.signReceiver')}</span></div>
      <p className="mt-8 text-center text-xs text-gray-500">{tt('print.receipt.computer')}</p>
    </>
  );
}

export function ReceiptPrintPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const [lang, setLang] = useState<PrintLang>(i18n.language === 'ur' ? 'ur' : 'en');
  const p = usePayment(id);
  const school = useLetterhead();
  const err = p.error ?? school.error;
  if (err) return <ErrorState title={t('platform.errors.generic')} description={platformError(t, err)} onRetry={() => { void p.refetch(); void school.refetch(); }} />;
  if (!p.data || !school.data) return <Spinner />;
  return (
    <PrintFrame lang={lang} onLang={setLang} backTo="/app/fees">
      <ReceiptSheet school={school.data} p={p.data} tt={i18n.getFixedT(lang) as unknown as PrintT} lang={lang} />
    </PrintFrame>
  );
}

export default VoucherPrintPage;
