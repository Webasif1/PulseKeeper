import { Types, type FilterQuery } from 'mongoose';

import { Notification, type INotification } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import type { NotificationTypeValue } from '../types/domain.js';

export interface PublicNotification {
  id: string;
  siteId?: string;
  incidentId?: string;
  type: NotificationTypeValue;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

type NotificationRow = INotification & { _id: Types.ObjectId };

function toPublicNotification(notification: NotificationRow): PublicNotification {
  return {
    id: notification._id.toString(),
    ...(notification.siteId ? { siteId: notification.siteId.toString() } : {}),
    ...(notification.incidentId ? { incidentId: notification.incidentId.toString() } : {}),
    type: notification.type,
    title: notification.title,
    message: notification.message,
    read: notification.read,
    createdAt: notification.createdAt,
  };
}

export async function listNotifications(
  userId: string,
  options: { unreadOnly: boolean; page: number; limit: number },
): Promise<{ items: PublicNotification[]; total: number; unreadCount: number }> {
  const filter: FilterQuery<INotification> = { userId: new Types.ObjectId(userId) };
  if (options.unreadOnly) filter.read = false;

  const [rows, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .lean(),
    Notification.countDocuments(filter),
    // Always the unfiltered unread count: the header badge shows it regardless
    // of which page or filter the panel is on.
    Notification.countDocuments({ userId: new Types.ObjectId(userId), read: false }),
  ]);

  return {
    items: (rows as NotificationRow[]).map(toPublicNotification),
    total,
    unreadCount,
  };
}

export async function markNotificationRead(
  userId: string,
  notificationId: string,
): Promise<PublicNotification> {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { read: true } },
    { new: true },
  ).lean();

  if (!notification) {
    throw AppError.notFound('Notification not found');
  }

  return toPublicNotification(notification as NotificationRow);
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await Notification.updateMany(
    { userId, read: false },
    { $set: { read: true } },
  );

  return result.modifiedCount ?? 0;
}
