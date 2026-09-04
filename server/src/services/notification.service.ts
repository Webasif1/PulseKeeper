import { env } from '../config/env.js';
import { Notification, NotificationChannel, Settings } from '../models/index.js';
import {
  NotificationType,
  type ChannelTypeValue,
  type NotificationTypeValue,
} from '../types/domain.js';
import { createLogger } from '../utils/logger.js';
import { getAdapter } from './channels/index.js';

import type { ChannelMessage } from './channels/index.js';

const log = createLogger('notifications');

export interface NotificationEvent {
  userId: string;
  siteId: string;
  siteName: string;
  siteUrl: string;
  incidentId?: string;
  type: NotificationTypeValue;
  title: string;
  message: string;
}

/** Which user preference governs each notification type. */
const PREFERENCE_FOR_TYPE: Record<
  NotificationTypeValue,
  'onDown' | 'onUp' | 'onSlow' | 'onSslExpiry'
> = {
  [NotificationType.SITE_DOWN]: 'onDown',
  [NotificationType.INCIDENT_OPENED]: 'onDown',
  [NotificationType.SITE_UP]: 'onUp',
  [NotificationType.INCIDENT_RESOLVED]: 'onUp',
  [NotificationType.SITE_SLOW]: 'onSlow',
  [NotificationType.SSL_EXPIRING]: 'onSslExpiry',
  [NotificationType.SSL_EXPIRED]: 'onSslExpiry',
};

const RECOVERY_TYPES = new Set<NotificationTypeValue>([
  NotificationType.SITE_UP,
  NotificationType.INCIDENT_RESOLVED,
]);

/** A channel is switched off after this many consecutive delivery failures. */
const FAILURE_LIMIT = 10;

function toChannelMessage(event: NotificationEvent): ChannelMessage {
  return {
    type: event.type,
    title: event.title,
    body: event.message,
    siteName: event.siteName,
    siteUrl: event.siteUrl,
    ...(env.dashboardUrl ? { dashboardUrl: `${env.dashboardUrl}/sites/${event.siteId}` } : {}),
    occurredAt: new Date(),
    isRecovery: RECOVERY_TYPES.has(event.type),
  };
}

/**
 * Deliver to one channel and record the outcome.
 *
 * Never throws. A channel that keeps failing is disabled rather than retried
 * forever: a webhook whose Slack app was uninstalled would otherwise generate
 * an outbound request and a log line for every alert, indefinitely.
 */
async function deliverToChannel(
  channel: { id: string; type: ChannelTypeValue; name: string },
  target: string,
  message: ChannelMessage,
): Promise<boolean> {
  try {
    const adapter = getAdapter(channel.type);
    await adapter.send(target, message);

    await NotificationChannel.updateOne(
      { _id: channel.id },
      {
        $set: { lastUsedAt: new Date(), lastSuccessAt: new Date(), consecutiveFailures: 0 },
        $unset: { lastError: '' },
      },
    );

    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Delivery failed';

    const updated = await NotificationChannel.findOneAndUpdate(
      { _id: channel.id },
      {
        $set: { lastUsedAt: new Date(), lastError: reason.slice(0, 300) },
        $inc: { consecutiveFailures: 1 },
      },
      { new: true },
    );

    if (updated && updated.consecutiveFailures >= FAILURE_LIMIT && updated.enabled) {
      await NotificationChannel.updateOne({ _id: channel.id }, { $set: { enabled: false } });
      log.warn(
        { channelId: channel.id, name: channel.name },
        'Channel disabled after repeated delivery failures',
      );
    }

    log.error({ err: error, channelId: channel.id, type: channel.type }, 'Channel delivery failed');
    return false;
  }
}

/**
 * Record a notification and deliver it everywhere the user has asked for.
 *
 * The in-app feed is written first and unconditionally, so the dashboard is
 * accurate even if every outbound channel is broken. Channels are then
 * delivered to in parallel, each failing independently — one dead webhook must
 * not stop an email, and neither must fail the monitoring sweep that triggered
 * them.
 */
export async function notify(event: NotificationEvent): Promise<void> {
  const settings = await Settings.findOne({ userId: event.userId }).lean();
  const preference = PREFERENCE_FOR_TYPE[event.type];

  if (settings && settings.notifications[preference] === false) {
    return;
  }

  await Notification.create({
    userId: event.userId,
    siteId: event.siteId,
    incidentId: event.incidentId,
    type: event.type,
    title: event.title,
    message: event.message,
  });

  // `target` is select: false on the schema, so it has to be asked for.
  const channels = await NotificationChannel.find({ userId: event.userId, enabled: true })
    .select('+target')
    .lean();

  if (channels.length === 0) return;

  const message = toChannelMessage(event);

  const results = await Promise.all(
    channels.map((channel) =>
      deliverToChannel(
        { id: channel._id.toString(), type: channel.type, name: channel.name },
        channel.target,
        message,
      ),
    ),
  );

  const delivered = results.filter(Boolean).length;

  log.info(
    { siteId: event.siteId, type: event.type, channels: channels.length, delivered },
    'Notification dispatched',
  );
}

/**
 * Send a test message to one channel.
 *
 * Throws, unlike the dispatch path: someone pressing "Send test" is asking
 * whether it works, so the failure is the answer they need.
 */
export async function sendTestNotification(
  type: ChannelTypeValue,
  target: string,
  siteName = 'Example Site',
): Promise<void> {
  const adapter = getAdapter(type);

  await adapter.send(target, {
    type: NotificationType.SITE_UP,
    title: 'PulseKeeper test notification',
    body: 'If you can read this, the channel is configured correctly.',
    siteName,
    siteUrl: 'https://example.com',
    ...(env.dashboardUrl ? { dashboardUrl: env.dashboardUrl } : {}),
    occurredAt: new Date(),
    isRecovery: true,
  });
}
