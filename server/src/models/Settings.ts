import { model, Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

import {
  MONITORING_DEFAULTS,
  MONITORING_LIMITS,
  RETENTION_DAYS_OPTIONS,
} from '../constants/monitoring.js';
import { THEME_PREFERENCES, ThemePreference, type ThemePreferenceValue } from '../types/domain.js';

/**
 * Per-user preferences (SPEC section 36).
 *
 * The monitoring values here seed the "Add website" form; each site then owns
 * its own copy, so changing a default never silently alters how existing sites
 * are monitored.
 */
export interface ISettings {
  userId: Types.ObjectId;

  defaultIntervalMinutes: number;
  defaultTimeoutSeconds: number;
  defaultSlowThresholdMs: number;
  defaultFailureThreshold: number;

  /** Health-check retention window in days (SPEC section 23). */
  dataRetentionDays: number;

  notifications: {
    onDown: boolean;
    onUp: boolean;
    onSlow: boolean;
  };

  theme: ThemePreferenceValue;

  createdAt: Date;
  updatedAt: Date;
}

export type SettingsDocument = HydratedDocument<ISettings>;
export type SettingsModel = Model<ISettings>;

const settingsSchema = new Schema<ISettings, SettingsModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },

    defaultIntervalMinutes: {
      type: Number,
      default: MONITORING_DEFAULTS.intervalMinutes,
      min: 1,
      max: 1440,
    },
    defaultTimeoutSeconds: {
      type: Number,
      default: MONITORING_DEFAULTS.timeoutSeconds,
      min: MONITORING_LIMITS.timeoutSeconds.min,
      max: MONITORING_LIMITS.timeoutSeconds.max,
    },
    defaultSlowThresholdMs: {
      type: Number,
      default: MONITORING_DEFAULTS.slowThresholdMs,
      min: MONITORING_LIMITS.slowThresholdMs.min,
      max: MONITORING_LIMITS.slowThresholdMs.max,
    },
    defaultFailureThreshold: {
      type: Number,
      default: MONITORING_DEFAULTS.failureThreshold,
      min: MONITORING_LIMITS.failureThreshold.min,
      max: MONITORING_LIMITS.failureThreshold.max,
    },

    dataRetentionDays: {
      type: Number,
      default: MONITORING_DEFAULTS.retentionDays,
      enum: RETENTION_DAYS_OPTIONS,
    },

    notifications: {
      onDown: { type: Boolean, default: true },
      onUp: { type: Boolean, default: true },
      onSlow: { type: Boolean, default: false },
    },

    theme: {
      type: String,
      enum: THEME_PREFERENCES,
      default: ThemePreference.SYSTEM,
    },
  },
  { timestamps: true },
);

export const Settings = model<ISettings, SettingsModel>('Settings', settingsSchema);
