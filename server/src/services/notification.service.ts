import { Notification, Settings } from '../models/index.js';
import { NotificationType, type NotificationTypeValue } from '../types/domain.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('notifications');

export interface NotificationEvent {
  userId: string;
  siteId: string;
  siteName: string;
  incidentId?: string;
  type: NotificationTypeValue;
  title: string;
  message: string;
}

/**
 * An outbound delivery channel.
 *
 * The in-app channel is the only implementation today. Email, Slack, Discord,
 * Telegram, and webhooks (SPEC section 18) each become a module implementing
 * this interface and registering below — no change to the calling code, which
 * is the point of defining it now rather than later.
 *
 * `send` must never throw: a channel that is down is not a reason to fail a
 * monitoring sweep. Implementations swallow and log their own errors.
 */
export interface NotificationChannel {
  readonly name: string;
  send(event: NotificationEvent): Promise<void>;
}

/** Writes the notification row the dashboard's bell reads. */
const inAppChannel: NotificationChannel = {
  name: 'in-app',
  async send(event) {
    await Notification.create({
      userId: event.userId,
      siteId: event.siteId,
      incidentId: event.incidentId,
      type: event.type,
      title: event.title,
      message: event.message,
    });
  },
};

const channels: NotificationChannel[] = [inAppChannel];

/** Register an additional channel. Exported for future channels and for tests. */
export function registerChannel(channel: NotificationChannel): void {
  channels.push(channel);
}

/** Which user preference governs each notification type. */
const PREFERENCE_FOR_TYPE: Record<NotificationTypeValue, 'onDown' | 'onUp' | 'onSlow'> = {
  [NotificationType.SITE_DOWN]: 'onDown',
  [NotificationType.INCIDENT_OPENED]: 'onDown',
  [NotificationType.SITE_UP]: 'onUp',
  [NotificationType.INCIDENT_RESOLVED]: 'onUp',
  [NotificationType.SITE_SLOW]: 'onSlow',
};

/**
 * Deliver one notification to every enabled channel.
 *
 * Each channel is awaited independently and its failure is logged rather than
 * propagated, so one broken integration cannot stop the others or abort the
 * sweep that triggered it.
 */
export async function notify(event: NotificationEvent): Promise<void> {
  const settings = await Settings.findOne({ userId: event.userId }).lean();
  const preference = PREFERENCE_FOR_TYPE[event.type];

  if (settings && settings.notifications[preference] === false) {
    return;
  }

  const results = await Promise.allSettled(channels.map((channel) => channel.send(event)));

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      log.error(
        { err: result.reason, channel: channels[index]?.name, siteId: event.siteId },
        'Notification channel failed',
      );
    }
  });
}
