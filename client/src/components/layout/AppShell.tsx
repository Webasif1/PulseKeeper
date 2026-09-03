import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { cn } from '@/lib/cn';

import { Header } from './Header';
import { Sidebar } from './Sidebar';

/**
 * The signed-in layout (SPEC §31).
 *
 * Desktop keeps a persistent rail; below `lg` the same navigation becomes a
 * slide-over. The mobile drawer is rendered only while open, so its links are
 * not in the tab order of a page that appears to have no navigation.
 */
export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const location = useLocation();

  // A drawer left open across a navigation would cover the page just reached.
  useEffect(() => {
    setIsNavigationOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isNavigationOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsNavigationOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isNavigationOpen]);

  return (
    <div className="min-h-full">
      {/* Lets a keyboard user reach the content without tabbing the whole nav. */}
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-[var(--border-subtle)] bg-[var(--surface-card)] lg:block">
        <Sidebar />
      </aside>

      {isNavigationOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-[fade-in_0.15s_ease-out] bg-black/50"
            aria-hidden="true"
            onClick={() => setIsNavigationOpen(false)}
          />
          <aside
            className={cn(
              'relative h-full w-72 max-w-[85vw] border-r border-[var(--border-subtle)]',
              'animate-[slide-in_0.2s_ease-out] bg-[var(--surface-card)]',
            )}
            aria-label="Navigation"
          >
            <Sidebar onNavigate={() => setIsNavigationOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <Header
          title={title}
          description={description}
          actions={actions}
          onOpenNavigation={() => setIsNavigationOpen(true)}
        />

        <main id="main-content" className="px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
