import { ChannelType } from '../../types/domain.js';
import { assertWebhookTargetAllowed, postJson } from './http.js';

import type { ChannelAdapter, ChannelMessage } from './types.js';

/**
 * Slack incoming webhooks.
 *
 * Uses Block Kit rather than a plain `text` field so the message is scannable
 * in a busy channel — the site name and the reason carry different weight, and
 * a wall of one-line alerts is what makes people mute an alerting channel.
 */
export const slackAdapter: ChannelAdapter = {
  type: ChannelType.SLACK,

  validateTarget(target) {
    return assertWebhookTargetAllowed(target, 'slack.com');
  },

  async send(target, message: ChannelMessage) {
    const emoji = message.isRecovery ? ':white_check_mark:' : ':rotating_light:';

    await postJson(target, {
      // `text` is the notification preview and the accessible fallback for
      // clients that cannot render blocks; it is not optional.
      text: `${emoji} ${message.title}`,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `${emoji} *${message.title}*\n${message.body}` },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `<${message.siteUrl}|${message.siteName}> · ${message.occurredAt.toISOString()}`,
            },
          ],
        },
      ],
    });
  },
};
