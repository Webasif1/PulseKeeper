import type { NotificationTypeValue } from '../../types/domain.js';

/**
 * What a channel is asked to deliver.
 *
 * Deliberately flat and free of database documents: an adapter should not be
 * able to reach anything the dispatcher did not explicitly hand it, which keeps
 * one user's data out of another user's webhook by construction.
 */
export interface ChannelMessage {
  type: NotificationTypeValue;
  title: string;
  body: string;
  siteName: string;
  siteUrl: string;
  /** Absolute URL back to the site in the dashboard, when one can be built. */
  dashboardUrl?: string;
  occurredAt: Date;
  /** True for a recovery, so adapters can colour the message accordingly. */
  isRecovery: boolean;
}

/**
 * A delivery transport.
 *
 * `send` throws on failure. The dispatcher catches, records the error against
 * the channel, and carries on — a broken integration must never fail a
 * monitoring sweep.
 */
export interface ChannelAdapter {
  readonly type: string;
  /**
   * Validate a target before it is stored, so a bad URL is rejected at the form
   * rather than discovered during an outage.
   */
  validateTarget(target: string): Promise<void>;
  send(target: string, message: ChannelMessage): Promise<void>;
}

/** Fields shared by the JSON bodies the webhook adapters post. */
export function messageSummary(message: ChannelMessage): string {
  return `${message.title} — ${message.body}`;
}
