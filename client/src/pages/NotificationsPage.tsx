import { BellOff, CheckCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { AppShell } from '@/components/layout/AppShell';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useNotifications } from '@/hooks/useNotifications';
import { usePolling } from '@/hooks/usePolling';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/cn';
import { ApiError } from '@/services/api';
import * as notificationService from '@/services/notification.service';

import type { AppNotification } from '@/types/api';

const POLL_INTERVAL_MS = 60_000;

/** The notification feed (SPEC §18). */
export function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { unreadCount, setUnread, adjustUnread } = useNotifications();
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const result = await notificationService.listNotifications({ unreadOnly, limit: 50 });
      setNotifications(result.items);
      // The list response already carries the authoritative count, so the badge
      // is corrected here rather than waiting for its own poll.
      setUnread(result.unreadCount);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load notifications');
    } finally {
      setIsLoading(false);
    }
  }, [unreadOnly, setUnread]);

  useEffect(() => {
    void load();
  }, [load]);

  usePolling(load, POLL_INTERVAL_MS);

  const handleMarkRead = async (id: string) => {
    // Updated locally first: waiting for the round trip makes the click feel
    // broken, and a failure is corrected by the reload below.
    setNotifications((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, read: true } : entry)),
    );
    adjustUnread(-1);

    try {
      await notificationService.markRead(id);
      if (unreadOnly) void load();
    } catch {
      toast.error('Could not mark that as read');
      void load();
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const { updated } = await notificationService.markAllRead();
      setNotifications((current) => current.map((entry) => ({ ...entry, read: true })));
      setUnread(0);
      toast.success(
        updated === 0 ? 'Nothing left to mark' : `${updated} notifications marked as read`,
      );
      if (unreadOnly) void load();
    } catch {
      toast.error('Could not mark everything as read');
    }
  };

  return (
    <AppShell
      title="Notifications"
      description={unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up'}
      actions={
        unreadCount > 0 ? (
          <Button
            size="sm"
            onClick={() => void handleMarkAllRead()}
            leftIcon={<CheckCheck className="h-4 w-4" aria-hidden="true" />}
          >
            <span className="hidden sm:inline">Mark all read</span>
          </Button>
        ) : undefined
      }
    >
      <div
        role="radiogroup"
        aria-label="Filter notifications"
        className="mb-5 inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-0.5"
      >
        {[
          { value: false, label: 'All' },
          { value: true, label: 'Unread' },
        ].map((filter) => (
          <button
            key={String(filter.value)}
            type="button"
            role="radio"
            aria-checked={unreadOnly === filter.value}
            onClick={() => setUnreadOnly(filter.value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              unreadOnly === filter.value
                ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="surface-card overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-5">
            <span className="sr-only" role="status">
              Loading notifications
            </span>
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title={unreadOnly ? 'No unread notifications' : 'No notifications yet'}
            description={
              unreadOnly
                ? 'Everything here has been read.'
                : 'PulseKeeper tells you here when a website goes down, recovers, or slows past its threshold.'
            }
            action={
              unreadOnly ? (
                <Button onClick={() => setUnreadOnly(false)}>Show all notifications</Button>
              ) : undefined
            }
          />
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkRead={(id) => void handleMarkRead(id)}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
