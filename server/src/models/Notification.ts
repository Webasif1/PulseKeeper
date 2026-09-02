import { model, Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

import { NOTIFICATION_TYPES, type NotificationTypeValue } from '../types/domain.js';

/** In-app notification (SPEC section 18). */
export interface INotification {
  userId: Types.ObjectId;
  siteId?: Types.ObjectId;
  incidentId?: Types.ObjectId;

  type: NotificationTypeValue;
  title: string;
  message: string;
  read: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export type NotificationDocument = HydratedDocument<INotification>;
export type NotificationModel = Model<INotification>;

const notificationSchema = new Schema<INotification, NotificationModel>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site' },
    incidentId: { type: Schema.Types.ObjectId, ref: 'Incident' },

    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 140 },
    message: { type: String, required: true, maxlength: 500 },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Serves both the notification panel and the unread badge count.
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const Notification = model<INotification, NotificationModel>(
  'Notification',
  notificationSchema,
);
