import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { usePolling } from '@/hooks/usePolling';
import * as notificationService from '@/services/notification.service';

/** Slower than the dashboard's 30s: a badge count is not urgent. */
const POLL_INTERVAL_MS = 60_000;

interface NotificationContextValue {
  unreadCount: number;
  /** Re-read the count, e.g. after marking something read. */
  refresh: () => Promise<void>;
  /** Adjust locally so the badge updates without waiting for a round trip. */
  adjustUnread: (delta: number) => void;
  setUnread: (count: number) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

/**
 * The unread count behind the header bell.
 *
 * Lives in context rather than on the notifications page because the badge is
 * visible from every page — a count fetched only where the list is rendered
 * would sit at zero everywhere else, which is worse than showing nothing.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      // limit=1 because only the count is wanted here; the page fetches the
      // list itself.
      const result = await notificationService.listNotifications({ limit: 1 });
      setUnreadCount(result.unreadCount);
    } catch {
      // A failed badge refresh is not worth interrupting anyone over; the next
      // poll tries again.
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }
    void refresh();
  }, [isAuthenticated, refresh]);

  usePolling(refresh, POLL_INTERVAL_MS, isAuthenticated);

  const adjustUnread = useCallback((delta: number) => {
    setUnreadCount((current) => Math.max(0, current + delta));
  }, []);

  const value = useMemo(
    () => ({ unreadCount, refresh, adjustUnread, setUnread: setUnreadCount }),
    [unreadCount, refresh, adjustUnread],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
