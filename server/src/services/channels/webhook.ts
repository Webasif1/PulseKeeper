import { ChannelType } from '../../types/domain.js';
import { assertWebhookTargetAllowed, postJson } from './http.js';

import type { ChannelAdapter, ChannelMessage } from './types.js';

/**
 * A generic JSON endpoint.
 *
 * The payload is flat, stable, and documented in docs/API.md, because anything
 * receiving it was written by whoever configured the channel. Adding a field is
 * safe; renaming or removing one is a breaking change for them.
 */
export const webhookAdapter: ChannelAdapter = {
  type: ChannelType.WEBHOOK,

  validateTarget(target) {
    return assertWebhookTargetAllowed(target);
  },

  async send(target, message: ChannelMessage) {
    await postJson(target, {
      event: message.type,
      title: message.title,
      message: message.body,
      site: { name: message.siteName, url: message.siteUrl },
      occurredAt: message.occurredAt.toISOString(),
      source: 'pulsekeeper',
    });
  },
};
