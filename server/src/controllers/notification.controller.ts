import type { Request, Response } from 'express';

import { getAuthUser } from '../middleware/requireAuth.js';
import { validatedParams, validatedQuery } from '../middleware/validate.js';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notification.query.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { buildPagination } from '../utils/apiResponse.js';
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from '../validators/analytics.validators.js';

export async function list(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);
  const query = validatedQuery(req, listNotificationsQuerySchema);

  const { items, total, unreadCount } = await listNotifications(userId, query);

  // Not sendPaginated: the header badge needs the unread count alongside the
  // page, and the client should not have to make a second request for it.
  sendSuccess(
    res,
    { items, unreadCount, pagination: buildPagination(total, query.page, query.limit) },
    'Notifications',
  );
}

export async function markRead(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);
  const { id } = validatedParams(req, notificationIdParamSchema);

  const notification = await markNotificationRead(userId, id);

  sendSuccess(res, { notification }, 'Notification marked as read');
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);

  const updated = await markAllNotificationsRead(userId);

  sendSuccess(res, { updated }, 'All notifications marked as read');
}
