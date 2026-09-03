import { AlertTriangle, CheckCircle2, CircleX, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useRelativeTime } from '@/hooks/useRelativeTime';
import { cn } from '@/lib/cn';

import type { AppNotification, NotificationType } from '@/types/api';

const PRESENTATION: Record<
  NotificationType,
  { icon: LucideIcon; tone: string; background: string }
> = {
  SITE_DOWN: { icon: CircleX, tone: 'text-offline', background: 'bg-offline-soft' },
  INCIDENT_OPENED: { icon: CircleX, tone: 'text-offline', background: 'bg-offline-soft' },
  SITE_UP: { icon: CheckCircle2, tone: 'text-online', background: 'bg-online-soft' },
  INCIDENT_RESOLVED: { icon: CheckCircle2, tone: 'text-online', background: 'bg-online-soft' },
  SITE_SLOW: { icon: AlertTriangle, tone: 'text-slow', background: 'bg-slow-soft' },
};

export function NotificationItem({
  notification,
  onMarkRead,
}: {
  notification: AppNotification;
  onMarkRead: (id: string) => void;
}) {
  const presentation = PRESENTATION[notification.type];
  const Icon = presentation.icon;
  const when = useRelativeTime(notification.createdAt);

  return (
    <article
      className={cn(
        'flex items-start gap-3 px-5 py-4 transition-colors',
        // Unread is marked by a tinted background and an explicit "New" label,
        // not by weight alone — a bold-versus-normal difference is easy to miss
        // in a long list.
        !notification.read && 'bg-[var(--surface-inset)]',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          presentation.background,
        )}
      >
        <Icon className={cn('h-4 w-4', presentation.tone)} aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium">{notification.title}</h3>
          {!notification.read && (
            <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              New
            </span>
          )}
        </div>

        <p className="mt-0.5 text-sm text-secondary">{notification.message}</p>

        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted">
          <span>{when}</span>
          {notification.siteId && (
            <Link
              to={`/sites/${notification.siteId}`}
              className="font-medium text-brand-500 hover:underline"
            >
              View website
            </Link>
          )}
        </div>
      </div>

      {!notification.read && (
        <button
          type="button"
          onClick={() => onMarkRead(notification.id)}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          Mark read
        </button>
      )}
    </article>
  );
}
