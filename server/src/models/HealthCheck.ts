import { model, Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

import {
  CHECK_ERROR_TYPES,
  CHECK_SOURCES,
  CheckSource,
  type CheckErrorTypeValue,
  type CheckSourceValue,
} from '../types/domain.js';

/**
 * One health check result (SPEC section 9).
 *
 * The highest-volume collection in the system and the source of truth for every
 * uptime and response-time figure, so its indexes matter more than any other.
 */
export interface IHealthCheck {
  siteId: Types.ObjectId;
  /**
   * Denormalised from the site so user-scoped analytics never need a join, and
   * so a deleted site's history stays attributable during cleanup.
   */
  userId: Types.ObjectId;

  checkedAt: Date;
  success: boolean;
  statusCode?: number;
  responseTimeMs?: number;
  errorType?: CheckErrorTypeValue;
  errorMessage?: string;
  source: CheckSourceValue;
  isDemo: boolean;
}

export type HealthCheckDocument = HydratedDocument<IHealthCheck>;
export type HealthCheckModel = Model<IHealthCheck>;

const healthCheckSchema = new Schema<IHealthCheck, HealthCheckModel>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    checkedAt: { type: Date, required: true, default: () => new Date() },
    success: { type: Boolean, required: true },
    // Absent on transport-level failures: a timeout or DNS error never produced
    // a status code or a meaningful duration.
    statusCode: { type: Number },
    responseTimeMs: { type: Number, min: 0 },
    errorType: { type: String, enum: CHECK_ERROR_TYPES },
    errorMessage: { type: String, maxlength: 500 },
    source: { type: String, enum: CHECK_SOURCES, default: CheckSource.CRON },
    isDemo: { type: Boolean, default: false },
  },
  {
    // checkedAt is the event time and is set explicitly; a second pair of
    // timestamps on the largest collection would be wasted storage.
    timestamps: false,
    versionKey: false,
  },
);

// Serves every per-site analytics query: a time window for one site, newest
// first. This is the index the site detail page lives or dies by.
healthCheckSchema.index({ siteId: 1, checkedAt: -1 });

// Dashboard-wide "recent checks" and cross-site analytics for one user.
healthCheckSchema.index({ userId: 1, checkedAt: -1 });

// Retention sweeps delete by age alone, across all sites.
healthCheckSchema.index({ checkedAt: 1 });

export const HealthCheck = model<IHealthCheck, HealthCheckModel>(
  'HealthCheck',
  healthCheckSchema,
);
