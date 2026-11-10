import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { useAuth } from '@/features/auth/auth-context';
import { Brand } from './brand';
import { navItems, upcomingModules } from './nav-config';

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ collapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const visibleItems = navItems.filter((item) => (item.permission ? can(item.permission) : item.anyOf ? item.anyOf.some((k) => can(k)) : true));
  const visibleUpcoming = upcomingModules.filter((item) => can(item.permission));
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 animate-fade-in bg-navy-950/60 lg:hidden" onClick={onCloseMobile} aria-hidden />}
      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-40 flex w-64 flex-col bg-gradient-to-b from-navy-950 via-[#0E1A52] to-[#1A1B66] text-white transition-[transform,width] duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full',
          'lg:static lg:translate-x-0 lg:rtl:translate-x-0',
          collapsed ? 'lg:w-[76px]' : 'lg:w-64',
        )}
      >
        <div className={cn('flex h-16 items-center justify-between border-b border-white/10 px-4', collapsed && 'lg:justify-center lg:px-0')}>
          <Brand inverted compact={collapsed} />
          <button type="button" onClick={onCloseMobile} aria-label={t('common.close')} className="rounded-md p-1 text-white/70 hover:bg-white/10 lg:hidden">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3" aria-label={t('nav.dashboard')}>
          <ul className="space-y-1">
            {visibleItems.map(({ key, path, icon: Icon, labelKey }) => (
              <li key={key}>
                <NavLink
                  to={path}
                  end={path === '/app'}
                  onClick={onCloseMobile}
                  title={collapsed ? t(labelKey) : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex h-11 items-center gap-3 rounded-control px-3 text-sm font-bold transition-colors',
                      collapsed && 'lg:justify-center lg:px-0',
                      isActive
                        ? 'bg-gradient-to-r from-brand-500 to-violet-600 text-white shadow-lg shadow-brand-500/25'
                        : 'text-white/80 hover:bg-white/10 hover:text-white',
                    )
                  }
                >
                  <Icon className="size-5 shrink-0" aria-hidden />
                  <span className={cn(collapsed && 'lg:sr-only')}>{t(labelKey)}</span>
                </NavLink>
              </li>
            ))}
          </ul>

          {visibleUpcoming.length > 0 && (
          <p className={cn('mt-6 px-3 text-[11px] font-bold uppercase tracking-wider text-white/40', collapsed && 'lg:sr-only')}>
            {t('nav.upcomingHeading')}
          </p>
          )}
          <ul className="mt-2 space-y-0.5">
            {visibleUpcoming.map(({ key, icon: Icon, labelKey }) => (
              <li key={key}>
                <div
                  aria-disabled="true"
                  title={`${t(labelKey)} - ${t('nav.soonHint')}`}
                  className={cn('flex h-10 cursor-not-allowed items-center gap-3 rounded-control px-3 text-sm font-semibold text-white/40', collapsed && 'lg:justify-center lg:px-0')}
                >
                  <Icon className="size-5 shrink-0" aria-hidden />
                  <span className={cn('truncate', collapsed && 'lg:sr-only')}>{t(labelKey)}</span>
                  <span className={cn('ms-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase text-white/55', collapsed && 'lg:hidden')}>
                    {t('nav.soon')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
}
