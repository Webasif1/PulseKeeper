import { model, Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

import { MONITORING_DEFAULTS, MONITORING_LIMITS } from '../constants/monitoring.js';
import { SITE_STATUSES, SiteStatus, type SiteStatusValue } from '../types/domain.js';

export interface ISite {
  userId: Types.ObjectId;
  name: string;
  url: string;
  /** Optional dedicated health endpoint; falls back to `url` when unset. */
  healthEndpoint?: string;
  description?: string;
  tags: string[];

  monitoringEnabled: boolean;
  intervalMinutes: number;
  timeoutSeconds: number;
  slowThresholdMs: number;
  failureThreshold: number;

  // Cached current state, written only by the monitoring engine. Historical
  // truth lives in the healthchecks collection; these fields exist so the
  // dashboard does not run an aggregation per site on every poll.
  currentStatus: SiteStatusValue;
  currentResponseTime?: number;
  currentStatusCode?: number;
  lastCheckedAt?: Date;
  lastSuccessAt?: Date;
  /** Consecutive failures so far; an incident opens at `failureThreshold`. */
  consecutiveFailures: number;
  /** Rolling 24-hour uptime, refreshed after each check. */
  uptimePercentage: number;
  activeIncidentId?: Types.ObjectId;

  // TLS certificate, read from the connection each https check already makes.
  sslValidTo?: Date;
  sslIssuer?: string;
  sslDaysRemaining?: number;
  sslCheckedAt?: Date;
  /**
   * The warning band already announced, in days.
   *
   * Prevents a daily "expires in 29 days" for a month, which is how people
   * learn to ignore alerts. Reset when a renewed certificate pushes the expiry
   * back out.
   */
  sslWarnedAtDays?: number;

  /** Marks generated demo data so it is never mistaken for real monitoring. */
  isDemo: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export type SiteDocument = HydratedDocument<ISite>;
export type SiteModel = Model<ISite>;

const siteSchema = new Schema<ISite, SiteModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: MONITORING_LIMITS.maxNameLength,
    },
    url: {
      type: String,
      required: [true, 'URL is required'],
      trim: true,
      maxlength: MONITORING_LIMITS.maxUrlLength,
    },
    healthEndpoint: {
      type: String,
      trim: true,
      maxlength: MONITORING_LIMITS.maxUrlLength,
    },
    description: {
      type: String,
      trim: true,
      maxlength: MONITORING_LIMITS.maxDescriptionLength,
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (tags: string[]) => tags.length <= MONITORING_LIMITS.maxTagsPerSite,
        message: `A site can have at most ${MONITORING_LIMITS.maxTagsPerSite} tags`,
      },
    },

    monitoringEnabled: { type: Boolean, default: true },
    intervalMinutes: {
      type: Number,
      default: MONITORING_DEFAULTS.intervalMinutes,
      min: 1,
      max: 1440,
    },
    timeoutSeconds: {
      type: Number,
      default: MONITORING_DEFAULTS.timeoutSeconds,
      min: MONITORING_LIMITS.timeoutSeconds.min,
      max: MONITORING_LIMITS.timeoutSeconds.max,
    },
    slowThresholdMs: {
      type: Number,
      default: MONITORING_DEFAULTS.slowThresholdMs,
      min: MONITORING_LIMITS.slowThresholdMs.min,
      max: MONITORING_LIMITS.slowThresholdMs.max,
    },
    failureThreshold: {
      type: Number,
      default: MONITORING_DEFAULTS.failureThreshold,
      min: MONITORING_LIMITS.failureThreshold.min,
      max: MONITORING_LIMITS.failureThreshold.max,
    },

    currentStatus: {
      type: String,
      enum: SITE_STATUSES,
      default: SiteStatus.UNKNOWN,
    },
    currentResponseTime: { type: Number, min: 0 },
    currentStatusCode: { type: Number },
    lastCheckedAt: { type: Date },
    lastSuccessAt: { type: Date },
    consecutiveFailures: { type: Number, default: 0, min: 0 },
    uptimePercentage: { type: Number, default: 0, min: 0, max: 100 },
    activeIncidentId: { type: Schema.Types.ObjectId, ref: 'Incident' },

    sslValidTo: { type: Date },
    sslIssuer: { type: String, maxlength: 200 },
    sslDaysRemaining: { type: Number },
    sslCheckedAt: { type: Date },
    sslWarnedAtDays: { type: Number },

    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Dashboard listing and status filtering, both always scoped to one user.
siteSchema.index({ userId: 1, createdAt: -1 });
siteSchema.index({ userId: 1, currentStatus: 1 });

// The scheduler's hot query: which enabled sites are due for a check. Ordering
// by lastCheckedAt lets the oldest checks be selected first.
siteSchema.index({ monitoringEnabled: 1, lastCheckedAt: 1 });

// Text search over name, description, and tags (SPEC section 19). URL is
// matched separately with a regex, since tokenising URLs works poorly.
siteSchema.index({ name: 'text', description: 'text', tags: 'text' });

/** The URL the monitor actually requests. */
siteSchema.virtual('checkUrl').get(function checkUrl(this: ISite): string {
  return this.healthEndpoint?.trim() || this.url;
});

siteSchema.set('toJSON', { virtuals: true });
siteSchema.set('toObject', { virtuals: true });

export const Site = model<ISite, SiteModel>('Site', siteSchema);
