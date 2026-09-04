import type { Types } from 'mongoose';

import { NotificationChannel, type INotificationChannel } from '../models/index.js';
import { ChannelType, type ChannelTypeValue } from '../types/domain.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import { getAdapter } from './channels/index.js';
import { sendTestNotification } from './notification.service.js';

const log = createLogger('channels');

/** More than this and the "notify everyone" fan-out stops being reasonable. */
const MAX_CHANNELS_PER_USER = 10;

export interface PublicChannel {
  id: string;
  type: ChannelTypeValue;
  name: string;
  /** Redacted. The full value is a bearer secret and never leaves the server. */
  targetPreview: string;
  enabled: boolean;
  lastUsedAt?: Date;
  lastSuccessAt?: Date;
  lastError?: string;
  consecutiveFailures: number;
  createdAt: Date;
}

type ChannelRow = INotificationChannel & { _id: Types.ObjectId };

/**
 * Show enough of a target to identify it, never enough to use it.
 *
 * A Slack incoming-webhook URL is a bearer credential: anyone holding it can
 * post to that channel. Returning it in an API response — where it would reach
 * the browser, any extension reading the page, and every proxy log along the
 * way — would leak it for no benefit, since the UI only needs to tell two
 * channels apart.
 */
function previewTarget(type: ChannelTypeValue, target: string): string {
  if (type === ChannelType.EMAIL) {
    const [local = '', domain = ''] = target.split('@');
    const visible = local.slice(0, 2);
    return `${visible}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`;
  }

  try {
    const url = new URL(target);
    // Host plus a hint of the path: enough to distinguish two Slack webhooks
    // pointing at different workspaces.
    return `${url.hostname}/…${target.slice(-4)}`;
  } catch {
    return '••••';
  }
}

function toPublicChannel(channel: ChannelRow): PublicChannel {
  return {
    id: channel._id.toString(),
    type: channel.type,
    name: channel.name,
    targetPreview: previewTarget(channel.type, channel.target ?? ''),
    enabled: channel.enabled,
    ...(channel.lastUsedAt ? { lastUsedAt: channel.lastUsedAt } : {}),
    ...(channel.lastSuccessAt ? { lastSuccessAt: channel.lastSuccessAt } : {}),
    ...(channel.lastError ? { lastError: channel.lastError } : {}),
    consecutiveFailures: channel.consecutiveFailures,
    createdAt: channel.createdAt,
  };
}

export async function listChannels(userId: string): Promise<PublicChannel[]> {
  const channels = await NotificationChannel.find({ userId })
    .select('+target')
    .sort({ createdAt: 1 })
    .lean();

  return (channels as ChannelRow[]).map(toPublicChannel);
}

export async function createChannel(
  userId: string,
  input: { type: ChannelTypeValue; name: string; target: string },
): Promise<PublicChannel> {
  const existing = await NotificationChannel.countDocuments({ userId });
  if (existing >= MAX_CHANNELS_PER_USER) {
    throw AppError.badRequest(
      `You can have at most ${MAX_CHANNELS_PER_USER} notification channels`,
    );
  }

  // Validated before storing, so a bad URL is rejected at the form rather than
  // discovered during an outage. This is also the SSRF check for webhook types.
  await getAdapter(input.type).validateTarget(input.target);

  const channel = await NotificationChannel.create({
    userId,
    type: input.type,
    name: input.name,
    target: input.target,
  });

  log.info({ userId, channelId: channel.id, type: input.type }, 'Notification channel created');

  return toPublicChannel(channel.toObject() as ChannelRow);
}

export async function updateChannel(
  userId: string,
  channelId: string,
  input: { name?: string; target?: string; enabled?: boolean },
): Promise<PublicChannel> {
  const channel = await NotificationChannel.findOne({ _id: channelId, userId }).select('+target');

  if (!channel) {
    throw AppError.notFound('Notification channel not found');
  }

  if (input.target && input.target !== channel.target) {
    await getAdapter(channel.type).validateTarget(input.target);
    channel.target = input.target;
    // A new target is a new destination, so the old failure history no longer
    // describes it.
    channel.consecutiveFailures = 0;
    channel.lastError = undefined;
  }

  if (input.name !== undefined) channel.name = input.name;

  if (input.enabled !== undefined) {
    channel.enabled = input.enabled;
    // Re-enabling after the automatic cut-off must actually give it a chance.
    if (input.enabled) channel.consecutiveFailures = 0;
  }

  await channel.save();

  return toPublicChannel(channel.toObject() as ChannelRow);
}

export async function deleteChannel(userId: string, channelId: string): Promise<void> {
  const result = await NotificationChannel.findOneAndDelete({ _id: channelId, userId });

  if (!result) {
    throw AppError.notFound('Notification channel not found');
  }

  log.info({ userId, channelId }, 'Notification channel deleted');
}

/**
 * Send a test message to a stored channel.
 *
 * Failures propagate: someone pressing "Send test" is asking whether it works,
 * so the error is the answer.
 */
export async function testChannel(userId: string, channelId: string): Promise<void> {
  const channel = await NotificationChannel.findOne({ _id: channelId, userId }).select('+target');

  if (!channel) {
    throw AppError.notFound('Notification channel not found');
  }

  try {
    await sendTestNotification(channel.type, channel.target);

    await NotificationChannel.updateOne(
      { _id: channel._id },
      {
        $set: { lastUsedAt: new Date(), lastSuccessAt: new Date(), consecutiveFailures: 0 },
        $unset: { lastError: '' },
      },
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Delivery failed';

    await NotificationChannel.updateOne(
      { _id: channel._id },
      { $set: { lastUsedAt: new Date(), lastError: reason.slice(0, 300) } },
    );

    throw error instanceof AppError
      ? error
      : AppError.badRequest(`Test delivery failed: ${reason}`);
  }
}
