import { get, patch } from './api';

import type { AppNotification, Pagination } from '@/types/api';

export interface NotificationList {
  items: AppNotification[];
  /** Total unread, unaffected by the current filter or page. */
  unreadCount: number;
  pagination: Pagination;
}

export function listNotifications(
  options: { unreadOnly?: boolean; page?: number; limit?: number } = {},
): Promise<NotificationList> {
  return get<NotificationList>('/api/notifications', options);
}

export function markRead(id: string): Promise<{ notification: AppNotification }> {
  return patch<{ notification: AppNotification }>(`/api/notifications/${id}/read`);
}

export function markAllRead(): Promise<{ updated: number }> {
  return patch<{ updated: number }>('/api/notifications/read-all');
}
