import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/cn';

/** Sub-navigation shared by the attendance pages; each tab only shows to users who may open it. */
export function AttendanceTabs() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const tabs = [
    { to: '/app/attendance', end: true, label: t('attendance.tabMark'), show: can('attendance.read') },
    { to: '/app/attendance/monthly', end: false, label: t('attendance.tabMonthly'), show: can('attendance.read') },
    { to: '/app/attendance/report', end: false, label: t('attendance.tabReport'), show: can('attendance.read') },
    { to: '/app/attendance/staff', end: false, label: t('attendance.tabStaff'), show: can('staff.attendance') },
  ].filter((x) => x.show);
  return (
    <nav aria-label={t('attendance.title')} className="mb-5 flex flex-wrap gap-1 rounded-control bg-white p-1 ring-1 ring-line sm:inline-flex">
      {tabs.map((x) => (
        <NavLink key={x.to} to={x.to} end={x.end}
          className={({ isActive }) => cn('rounded-md px-4 py-1.5 text-sm font-semibold', isActive ? 'bg-brand-600 text-white' : 'text-muted hover:bg-canvas hover:text-navy-900')}>
          {x.label}
        </NavLink>
      ))}
    </nav>
  );
}
