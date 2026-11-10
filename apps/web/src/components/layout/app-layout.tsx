import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Breadcrumbs, type Crumb } from '@/components/ui/breadcrumbs';
import { navItems } from './nav-config';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

const COLLAPSE_KEY = 'nexora.sidebar.collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function AppLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname]);

  const toggleCollapse = () =>
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, value ? '0' : '1');
      } catch {
        /* preference just won't persist */
      }
      return !value;
    });

  const crumbs: Crumb[] = [{ label: t('nav.dashboard'), to: '/app' }];
  const current = navItems.find((item) => item.path === pathname && item.path !== '/app');
  if (current) crumbs.push({ label: t(current.labelKey) });

  return (
    <div className="flex h-screen overflow-hidden">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[70] focus:rounded-control focus:bg-white focus:px-4 focus:py-2 focus:shadow-pop">
        {t('common.skipToContent')}
      </a>
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar collapsed={collapsed} onToggleCollapse={toggleCollapse} onOpenMobile={() => setMobileOpen(true)} />
        <main id="main" className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-7xl space-y-6">
            {pathname !== '/app' && <Breadcrumbs items={crumbs} />}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
