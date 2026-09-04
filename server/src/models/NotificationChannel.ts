import { model, Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

import { CHANNEL_TYPES, type ChannelTypeValue } from '../types/domain.js';

/**
 * A user's outbound delivery destination (SPEC section 18).
 *
 * Separate from the in-app feed, which every user has by definition. A channel
 * is somewhere a notification is *sent*: a Slack workspace, a Discord server, a
 * generic endpoint, or an email address.
 */
export interface INotificationChannel {
  userId: Types.ObjectId;

  type: ChannelTypeValue;
  /** User-facing label, e.g. "Team Slack" or "On-call inbox". */
  name: string;
  /**
   * The webhook URL, or the address for an email channel.
   *
   * Webhook URLs are secrets — anyone holding a Slack incoming-webhook URL can
   * post to that channel — so this is `select: false` and never returned in
   * full by the API.
   */
  target: string;

  enabled: boolean;

  /** Delivery health, so a silently broken channel is visible in the UI. */
  lastUsedAt?: Date;
  lastSuccessAt?: Date;
  lastError?: string;
  consecutiveFailures: number;

  createdAt: Date;
  updatedAt: Date;
}

export type NotificationChannelDocument = HydratedDocument<INotificationChannel>;
export type NotificationChannelModel = Model<INotificationChannel>;

const notificationChannelSchema = new Schema<INotificationChannel, NotificationChannelModel>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    type: { type: String, enum: CHANNEL_TYPES, required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    target: { type: String, required: true, trim: true, maxlength: 2048, select: false },

    enabled: { type: Boolean, default: true },

    lastUsedAt: { type: Date },
    lastSuccessAt: { type: Date },
    lastError: { type: String, maxlength: 300 },
    consecutiveFailures: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// The dispatch path: every enabled channel for one user.
notificationChannelSchema.index({ userId: 1, enabled: 1 });

export const NotificationChannel = model<INotificationChannel, NotificationChannelModel>(
  'NotificationChannel',
  notificationChannelSchema,
);
