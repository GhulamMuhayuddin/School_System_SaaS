import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';

/** Sub-navigation of the Accounts module. */
export function AccountsTabs() {
  const { t } = useTranslation();
  const tabs = [
    { to: '/app/accounts', end: true, label: t('accounts.tabLedger') },
    { to: '/app/accounts/categories', end: false, label: t('accounts.tabCategories') },
    { to: '/app/accounts/reports', end: false, label: t('accounts.tabReports') },
  ];
  return (
    <nav aria-label={t('accounts.title')} className="mb-5 flex flex-wrap gap-1 rounded-control bg-white p-1 ring-1 ring-line sm:inline-flex">
      {tabs.map((x) => (
        <NavLink key={x.to} to={x.to} end={x.end}
          className={({ isActive }) => cn('rounded-md px-4 py-1.5 text-sm font-semibold', isActive ? 'bg-brand-600 text-white' : 'text-muted hover:bg-canvas hover:text-navy-900')}>
          {x.label}
        </NavLink>
      ))}
    </nav>
  );
}
