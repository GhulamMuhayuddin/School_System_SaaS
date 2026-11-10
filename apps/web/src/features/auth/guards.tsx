import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ErrorState, Spinner } from '@/components/ui/states';
import { useAuth } from './auth-context';

/** Layout route: signed-out visitors are sent to /login and returned to the page they wanted afterwards. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Spinner />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

/** Layout route for login / forgot-password: signed-in users go straight to the app. */
export function PublicOnly() {
  const { status } = useAuth();
  if (status === 'loading') return <Spinner />;
  if (status === 'authenticated') return <Navigate to="/app" replace />;
  return <Outlet />;
}

/** Wrap a page that needs a permission. The API enforces the same rule; this just shows a clear message. */
export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  if (!can(permission)) return <ErrorState title={t('common.forbiddenTitle')} description={t('common.forbiddenBody')} />;
  return <>{children}</>;
}

/** Like RequirePermission, but the user needs AT LEAST ONE of the permissions. */
export function RequireAnyPermission({ anyOf, children }: { anyOf: string[]; children: ReactNode }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  if (!anyOf.some((k) => can(k))) return <ErrorState title={t('common.forbiddenTitle')} description={t('common.forbiddenBody')} />;
  return <>{children}</>;
}
