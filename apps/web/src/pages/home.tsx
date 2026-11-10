import { lazy } from 'react';
import { useAuth } from '@/features/auth/auth-context';

const PlatformDashboard = lazy(() => import('./platform-dashboard'));
const SchoolDashboard = lazy(() => import('./school-dashboard'));
const PortalHome = lazy(() => import('./portal-home'));
const SampleDashboard = lazy(() => import('./dashboard'));

/**
 * /app landing page.
 * - platform user (no school): Super Admin dashboard (real data)
 * - school user with school.audit.view (administrator, principal, vice principal): real school dashboard
 * - parent / student accounts (portal.own.read): their linked children
 * - everyone else: the design-preview dashboard with SAMPLE numbers (clearly labelled) until their own module dashboards exist
 */
export default function HomePage() {
  const { user, can } = useAuth();
  if (user && user.school === null) return <PlatformDashboard />;
  if (can('school.audit.view')) return <SchoolDashboard />;
  if (can('portal.own.read') && !can('student.read')) return <PortalHome />;
  return <SampleDashboard />;
}
