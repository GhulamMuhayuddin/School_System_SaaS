import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';

/** Sub-navigation shared by the exam list and the grading scale. */
export function ExamsTabs() {
  const { t } = useTranslation();
  const tabs = [
    { to: '/app/exams', end: true, label: t('exams.tabExams') },
    { to: '/app/exams/grades', end: false, label: t('exams.tabGrades') },
  ];
  return (
    <nav aria-label={t('exams.title')} className="mb-5 flex flex-wrap gap-1 rounded-control bg-white p-1 ring-1 ring-line sm:inline-flex">
      {tabs.map((x) => (
        <NavLink key={x.to} to={x.to} end={x.end}
          className={({ isActive }) => cn('rounded-md px-4 py-1.5 text-sm font-semibold', isActive ? 'bg-brand-600 text-white' : 'text-muted hover:bg-canvas hover:text-navy-900')}>
          {x.label}
        </NavLink>
      ))}
    </nav>
  );
}

export const ExamStatusBadgeTone = (status: 'DRAFT' | 'PUBLISHED'): 'success' | 'warning' => (status === 'PUBLISHED' ? 'success' : 'warning');
