import {
  Activity,
  BarChart3,
  Bell,
  Globe,
  LayoutDashboard,
  ScrollText,
  Settings,
  X,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { cn } from '@/lib/cn';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/sites', label: 'Websites', icon: Globe, end: false },
  { to: '/incidents', label: 'Incidents', icon: Activity, end: false },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, end: false },
  { to: '/notifications', label: 'Notifications', icon: Bell, end: false },
  { to: '/logs', label: 'Monitoring log', icon: ScrollText, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
];

/**
 * Primary navigation (SPEC §29).
 *
 * One component for both layouts: a fixed rail on desktop, and the same markup
 * inside a slide-over on mobile. Two implementations would drift apart.
 */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600"
          aria-hidden="true"
        >
          <Activity className="h-4.5 w-4.5 text-white" />
        </span>
        <span className="text-base font-semibold tracking-tight">PulseKeeper</span>

        {onNavigate && (
          <button
            type="button"
            onClick={onNavigate}
            aria-label="Close navigation"
            className="ml-auto rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[var(--surface-inset)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
                {item.label}
                {/* Announces the current page rather than relying on colour. */}
                {isActive && <span className="sr-only">(current page)</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
