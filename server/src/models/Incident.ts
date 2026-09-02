import { model, Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

import {
  CHECK_ERROR_TYPES,
  INCIDENT_STATUSES,
  IncidentStatus,
  type CheckErrorTypeValue,
  type IncidentStatusValue,
} from '../types/domain.js';

/**
 * An outage window (SPEC section 16).
 *
 * One incident spans many failed checks: it opens only after the site's
 * configured number of consecutive failures and closes on the first recovery.
 */
export interface IIncident {
  siteId: Types.ObjectId;
  userId: Types.ObjectId;

  status: IncidentStatusValue;
  /** Human-readable cause, e.g. "Request timed out" or "HTTP 503". */
  reason: string;
  errorType?: CheckErrorTypeValue;
  statusCode?: number;

  startedAt: Date;
  resolvedAt?: Date;
  durationSeconds?: number;
  /** Number of failed checks recorded while this incident was open. */
  failedChecks: number;

  createdAt: Date;
  updatedAt: Date;
}

export type IncidentDocument = HydratedDocument<IIncident>;
export type IncidentModel = Model<IIncident>;

const incidentSchema = new Schema<IIncident, IncidentModel>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    status: {
      type: String,
      enum: INCIDENT_STATUSES,
      default: IncidentStatus.ACTIVE,
      required: true,
    },
    reason: { type: String, required: true, maxlength: 300 },
    errorType: { type: String, enum: CHECK_ERROR_TYPES },
    statusCode: { type: Number },

    startedAt: { type: Date, required: true, default: () => new Date() },
    resolvedAt: { type: Date },
    durationSeconds: { type: Number, min: 0 },
    failedChecks: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true },
);

// Incident history for one site, newest first.
incidentSchema.index({ siteId: 1, startedAt: -1 });

// The /incidents page: one user's incidents filtered by status.
incidentSchema.index({ userId: 1, status: 1, startedAt: -1 });

/**
 * A site can have at most one open incident.
 *
 * Enforced by the database rather than by service logic alone: concurrent
 * sweeps, a manual check racing the cron job, or a retry could otherwise open
 * duplicates for the same outage.
 */
incidentSchema.index(
  { siteId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: IncidentStatus.ACTIVE },
    name: 'one_active_incident_per_site',
  },
);

export const Incident = model<IIncident, IncidentModel>('Incident', incidentSchema);
