import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/states';

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <EmptyState
        title={t('errors.notFoundTitle')}
        description={t('errors.notFoundBody')}
        action={<Link to="/app" className="inline-flex h-10 items-center rounded-control bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">{t('errors.goHome')}</Link>}
      />
    </div>
  );
}
