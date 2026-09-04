import { ChannelType } from '../../types/domain.js';
import { assertWebhookTargetAllowed, postJson } from './http.js';

import type { ChannelAdapter, ChannelMessage } from './types.js';

/** Discord's decimal colour values for the embed stripe. */
const COLOUR_RECOVERED = 0x22c55e;
const COLOUR_DOWN = 0xef4444;

export const discordAdapter: ChannelAdapter = {
  type: ChannelType.DISCORD,

  validateTarget(target) {
    return assertWebhookTargetAllowed(target, 'discord.com');
  },

  async send(target, message: ChannelMessage) {
    await postJson(target, {
      username: 'PulseKeeper',
      embeds: [
        {
          title: message.title,
          description: message.body,
          url: message.dashboardUrl ?? message.siteUrl,
          color: message.isRecovery ? COLOUR_RECOVERED : COLOUR_DOWN,
          fields: [{ name: 'Website', value: message.siteName, inline: true }],
          timestamp: message.occurredAt.toISOString(),
        },
      ],
    });
  },
};
