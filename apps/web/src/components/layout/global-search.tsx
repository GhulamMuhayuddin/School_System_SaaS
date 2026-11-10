import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { navItems } from './nav-config';

/** Searches the pages that exist today. Record search (students, fees, ...) plugs in with each module. */
export function GlobalSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const q = query.trim().toLowerCase();
  const results = q ? navItems.filter((item) => t(item.labelKey).toLowerCase().includes(q)) : [];

  const go = (path: string) => {
    navigate(path);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) go(results[0].path);
          if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
        }}
        placeholder={t('common.searchPlaceholder')}
        aria-label={t('common.searchPlaceholder')}
        className="h-10 w-full rounded-control bg-canvas ps-9 pe-3 text-sm ring-1 ring-inset ring-line placeholder:text-muted/70 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-0"
      />
      {open && q && (
        <ul className="absolute start-0 top-12 z-30 w-full animate-pop-in overflow-hidden rounded-card bg-white py-1 shadow-pop">
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted">{t('common.noResults')}</li>
          ) : (
            results.map(({ key, path, icon: Icon, labelKey }) => (
              <li key={key}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); go(path); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm font-medium text-ink hover:bg-brand-50"
                >
                  <Icon className="size-4 text-brand-600" aria-hidden />
                  {t(labelKey)}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
