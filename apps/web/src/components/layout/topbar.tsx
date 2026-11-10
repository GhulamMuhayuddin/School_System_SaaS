import { Bell, LogOut, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/auth-context';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { GlobalSearch } from './global-search';
import { LanguageSwitcher } from './language-switcher';

interface TopbarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobile: () => void;
}

const popContent = 'z-40 animate-pop-in rounded-card bg-white shadow-pop';

export function Topbar({ collapsed, onToggleCollapse, onOpenMobile }: TopbarProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const fullName = user ? `${user.firstName} ${user.lastName}`.trim() : t('common.guest');
  const initials = user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() : '?';
  const roleLabel = user ? t(`roles.${user.role.key}`, { defaultValue: user.role.name }) : t('common.notSignedIn');
  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };
  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const collapseLabel = collapsed ? t('common.expandSidebar') : t('common.collapseSidebar');

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur sm:px-6">
      <Button variant="ghost" size="sm" className="lg:hidden" onClick={onOpenMobile} aria-label={t('common.openMenu')}>
        <Menu className="size-5" aria-hidden />
      </Button>
      <Button variant="ghost" size="sm" className="hidden rtl:scale-x-[-1] lg:inline-flex" onClick={onToggleCollapse} aria-label={collapseLabel} title={collapseLabel}>
        <CollapseIcon className="size-5" aria-hidden />
      </Button>

      <div className="flex flex-1 justify-center sm:justify-start"><GlobalSearch /></div>

      <div className="flex items-center gap-1">
        <LanguageSwitcher className="hidden sm:inline-flex" />

        <Popover.Root>
          <Popover.Trigger asChild>
            <Button variant="ghost" size="sm" aria-label={t('common.notifications')}>
              <Bell className="size-5" aria-hidden />
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content align="end" sideOffset={8} className={`${popContent} w-80`}>
              <div className="border-b border-line px-4 py-3 text-sm font-bold text-navy-900">{t('common.notifications')}</div>
              <EmptyState title={t('common.noNotifications')} description={t('common.noNotificationsBody')} />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <Popover.Root>
          <Popover.Trigger asChild>
            <Button variant="ghost" size="md" className="gap-2 px-2" aria-label={t('common.profileMenu')}>
              <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 text-xs font-bold text-white">
                {initials}
              </span>
              <span className="hidden text-start leading-tight sm:block">
                <span className="block text-sm font-bold text-navy-900">{fullName}</span>
                <span className="block text-xs font-medium text-muted">{roleLabel}</span>
              </span>
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content align="end" sideOffset={8} className={`${popContent} w-64 p-4`}>
              <p className="text-sm font-bold text-navy-900">{fullName}</p>
              <p className="truncate text-sm text-muted">{user?.email}</p>
              <p className="mt-1 text-xs font-semibold text-brand-600">
                {roleLabel}
                {user?.school ? ` · ${user.school.name}` : ''}
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <LanguageSwitcher className="justify-start sm:hidden" />
                <Button variant="secondary" onClick={() => void onLogout()}>
                  <LogOut className="size-4 rtl:-scale-x-100" aria-hidden />
                  {t('common.logout')}
                </Button>
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </header>
  );
}
