import { ChannelType, type ChannelTypeValue } from '../../types/domain.js';
import { AppError } from '../../utils/AppError.js';
import { discordAdapter } from './discord.js';
import { emailAdapter } from './email.js';
import { slackAdapter } from './slack.js';
import { webhookAdapter } from './webhook.js';

import type { ChannelAdapter } from './types.js';

/**
 * The adapter registry.
 *
 * Adding a transport means adding one file and one entry here — nothing in the
 * monitoring engine or the dispatcher changes, which is the whole point of the
 * interface.
 */
const ADAPTERS: Record<ChannelTypeValue, ChannelAdapter> = {
  [ChannelType.SLACK]: slackAdapter,
  [ChannelType.DISCORD]: discordAdapter,
  [ChannelType.WEBHOOK]: webhookAdapter,
  [ChannelType.EMAIL]: emailAdapter,
};

export function getAdapter(type: ChannelTypeValue): ChannelAdapter {
  const adapter = ADAPTERS[type];

  if (!adapter) {
    throw AppError.badRequest(`Unsupported notification channel type: ${type}`);
  }

  return adapter;
}

export type { ChannelAdapter, ChannelMessage } from './types.js';
