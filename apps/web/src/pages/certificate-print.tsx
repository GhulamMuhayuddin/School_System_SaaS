import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { PrintFrame, SchoolLetterhead, type PrintLang } from '@/components/print/print-frame';
import { ErrorState, Spinner } from '@/components/ui/states';
import { certificateText, useCertificate } from '@/features/certificates/certificates-api';
import { fmtDate, platformError } from '@/features/platform/common';

/** A printable certificate. The wording follows the language chosen on this page, not the screen language. */
export default function CertificatePrintPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const [lang, setLang] = useState<PrintLang>(i18n.language === 'ur' ? 'ur' : 'en');
  const one = useCertificate(id);
  if (one.isLoading) return <Spinner />;
  if (one.error || !one.data) return <ErrorState title={t('platform.errors.generic')} description={one.error ? platformError(t, one.error) : undefined} onRetry={() => void one.refetch()} />;
  const { certificate: c, school } = one.data;
  const tt = i18n.getFixedT(lang) as unknown as (key: string, options?: Record<string, unknown>) => string;
  const fmt = (iso: string) => fmtDate(iso, lang);
  const paragraphs = certificateText(tt, c, fmt);
  return (
    <PrintFrame lang={lang} onLang={setLang} backTo="/app/certificates">
      <div className="relative min-h-[240mm]">
        {c.status === 'VOID' ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-8xl font-black uppercase text-rose-600/20 -rotate-12" aria-hidden>{tt('print.cert.void')}</div> : null}
        <SchoolLetterhead school={school} />
        <h2 className="mt-8 text-center text-2xl font-extrabold underline underline-offset-8">{tt(`print.cert.titles.${c.type}`)}</h2>
        <div className="mt-3 flex justify-between text-sm"><span>{tt('print.cert.number')}: <b dir="ltr">{c.certNo}</b></span><span>{tt('print.cert.issuedOn')}: <b>{fmt(c.issuedOn)}</b></span></div>
        <div className="mt-10 space-y-5 text-lg leading-loose">{paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div>
        {c.status === 'VOID' ? <p className="mt-6 text-center font-bold text-rose-700">{tt('print.cert.voidNote')}</p> : null}
        <div className="mt-24 flex justify-between text-sm"><span className="border-t border-black px-6 pt-1">{tt('print.cert.stamp')}</span><span className="border-t border-black px-6 pt-1">{tt('print.cert.principal')}</span></div>
      </div>
    </PrintFrame>
  );
}
