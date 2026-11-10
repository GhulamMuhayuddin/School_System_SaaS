import { Globe, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const next = i18n.language === 'ur' ? 'en' : 'ur';
  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      onClick={() => void i18n.changeLanguage(next)}
      aria-label={t('common.language')}
      lang={next}
    >
      <Languages className="size-4" aria-hidden />
      {next === 'ur' ? 'اردو' : 'English'}
    </Button>
  );
}

/** Compact dropdown (globe + language) used on the auth pages. */
export function LanguageSelect({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  return (
    <label className={`flex items-center gap-2 rounded-full border border-[#dddafa] bg-white/85 px-[15px] py-2.5 text-[#20276c] ${className ?? ''}`}>
      <span className="sr-only">{t('auth.languageLabel')}</span>
      <Globe className="size-5" aria-hidden />
      <select
        value={i18n.language === 'ur' ? 'ur' : 'en'}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
        className="cursor-pointer border-0 bg-transparent text-sm font-semibold text-[#18205b] outline-none"
      >
        <option value="en">English</option>
        <option value="ur">اردو</option>
      </select>
    </label>
  );
}
