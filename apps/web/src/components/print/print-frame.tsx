import { ArrowLeft, Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

export type PrintLang = 'en' | 'ur';
export interface Letterhead { name: string; address: string | null; city: string | null; phone: string | null; email: string | null }

/**
 * A screen toolbar (back, language, print) around an A4 sheet. Only the sheet is printed.
 * The sheet gets its own language and direction, so an Urdu certificate prints right-to-left even when the screen is in English.
 */
export function PrintFrame({ lang, onLang, backTo, children, sheets = false }: { lang: PrintLang; onLang: (l: PrintLang) => void; backTo: string; children: ReactNode; sheets?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Link to={backTo} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{t('print.toolbar.back')}</Link>
        <div role="group" aria-label={t('print.toolbar.language')} className="flex gap-1 rounded-lg bg-white p-1 ring-1 ring-line">
          {(['en', 'ur'] as const).map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => onLang(l)} className={cn('rounded-md px-3 py-1 text-sm font-semibold', lang === l ? 'bg-brand-600 text-white' : 'text-muted hover:bg-canvas')}>{l === 'en' ? 'English' : 'اردو'}</button>
          ))}
        </div>
        <Button onClick={() => window.print()}><Printer className="size-4" aria-hidden />{t('print.toolbar.print')}</Button>
        <p className="text-xs text-muted">{t('print.toolbar.hint')}</p>
      </div>
      <div className={cn('print-area mx-auto w-full max-w-[210mm] text-black', sheets ? 'space-y-6' : 'rounded-card bg-white p-10 shadow-card ring-1 ring-line', lang === 'ur' && 'font-urdu')} lang={lang} dir={lang === 'ur' ? 'rtl' : 'ltr'}>
        {children}
      </div>
    </div>
  );
}

/** School name and address at the top of a printed page. */
export function SchoolLetterhead({ school }: { school: Letterhead }) {
  const line = [school.address, school.city].filter(Boolean).join(', ');
  const contact = [school.phone, school.email].filter(Boolean).join(' · ');
  return (
    <header className="border-b-2 border-black pb-3 text-center">
      <h1 className="text-2xl font-extrabold tracking-wide">{school.name}</h1>
      {line ? <p className="text-sm">{line}</p> : null}
      {contact ? <p className="text-xs" dir="ltr">{contact}</p> : null}
    </header>
  );
}

/** One A4 page inside a PrintFrame with `sheets`: several of them print one per page. */
export function PrintPage({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('print-page rounded-card bg-white p-10 shadow-card ring-1 ring-line', className)}>{children}</section>;
}
