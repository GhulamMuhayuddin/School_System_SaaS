import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/cn';

/** Sub-navigation of the Fees module (reports only for fee.report). */
export function FeesTabs() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const tabs = [
    { to: '/app/fees', end: true, label: t('fees.tabVouchers'), show: true },
    { to: '/app/fees/setup', end: false, label: t('fees.tabSetup'), show: true },
    { to: '/app/fees/reports', end: false, label: t('fees.tabReports'), show: can('fee.report') },
  ].filter((x) => x.show);
  return (
    <nav aria-label={t('fees.title')} className="mb-5 flex flex-wrap gap-1 rounded-control bg-white p-1 ring-1 ring-line sm:inline-flex">
      {tabs.map((x) => (
        <NavLink key={x.to} to={x.to} end={x.end}
          className={({ isActive }) => cn('rounded-md px-4 py-1.5 text-sm font-semibold', isActive ? 'bg-brand-600 text-white' : 'text-muted hover:bg-canvas hover:text-navy-900')}>
          {x.label}
        </NavLink>
      ))}
    </nav>
  );
}
