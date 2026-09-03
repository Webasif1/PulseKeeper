import { Bell, LogOut, Menu, User as UserIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Dropdown } from '@/components/ui/Dropdown';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { useToast } from '@/hooks/useToast';

import { ThemeToggle } from './ThemeToggle';

/**
 * Page header (SPEC §29).
 *
 * The page title lives here rather than in each page so the heading hierarchy
 * is consistent: one `h1` per view, always in the same place.
 */
export function Header({
  title,
  description,
  actions,
  onOpenNavigation,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  onOpenNavigation: () => void;
}) {
  const { user, logout } = useAuth();
  // From context, not a prop: the bell is visible on every page, so a count
  // passed in by whichever page happened to fetch it would read zero
  // everywhere else.
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  const toast = useToast();

  const handleSignOut = async () => {
    await logout();
    toast.success('Signed out');
    navigate('/login');
  };

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--surface-page)]/85 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onOpenNavigation}
          aria-label="Open navigation"
          className="-ml-1 rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold sm:text-lg">{title}</h1>
          {description && <p className="truncate text-xs text-muted">{description}</p>}
        </div>

        <div className="flex items-center gap-2">
          {actions}

          <div className="hidden sm:block">
            <ThemeToggle />
          </div>

          <button
            type="button"
            onClick={() => navigate('/notifications')}
            className="relative rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            aria-label={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : 'Notifications'
            }
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            {unreadCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-offline px-1 text-[10px] font-semibold text-white"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <Dropdown
            label="Account menu"
            trigger={
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                {initials}
              </span>
            }
            items={[
              {
                label: user?.email ?? 'Account',
                icon: <UserIcon className="h-4 w-4" aria-hidden="true" />,
                onSelect: () => navigate('/settings'),
              },
              {
                label: 'Sign out',
                icon: <LogOut className="h-4 w-4" aria-hidden="true" />,
                onSelect: () => void handleSignOut(),
                destructive: true,
              },
            ]}
          />
        </div>
      </div>
    </header>
  );
}
