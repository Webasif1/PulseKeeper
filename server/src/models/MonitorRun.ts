import { model, Schema, type HydratedDocument, type Model } from 'mongoose';

import { CHECK_SOURCES, CheckSource, type CheckSourceValue } from '../types/domain.js';

/**
 * A record of one monitoring sweep (SPEC section 40).
 *
 * This is operational telemetry about the instance, not user data: it holds
 * aggregate counters only — never site names, URLs, or ids — so surfacing it to
 * any signed-in user reveals nothing about anyone else's sites. That is a
 * deliberate trade-off for a self-hosted tool, and the reason the document
 * carries no userId.
 */
export interface IMonitorRun {
  startedAt: Date;
  finishedAt?: Date;
  durationMs?: number;

  trigger: CheckSourceValue;

  checked: number;
  online: number;
  slow: number;
  offline: number;
  /**
   * Sites whose check threw unexpectedly, as opposed to failing normally.
   *
   * Named `errorCount` rather than `errors` because `errors` is a reserved
   * Mongoose path — it would shadow the document's validation-error container.
   * The API serialises it back to `errors` to match SPEC section 40.
   */
  errorCount: number;

  incidentsOpened: number;
  incidentsResolved: number;

  createdAt: Date;
  updatedAt: Date;
}

export type MonitorRunDocument = HydratedDocument<IMonitorRun>;
export type MonitorRunModel = Model<IMonitorRun>;

const monitorRunSchema = new Schema<IMonitorRun, MonitorRunModel>(
  {
    startedAt: { type: Date, required: true, default: () => new Date() },
    finishedAt: { type: Date },
    durationMs: { type: Number, min: 0 },

    trigger: { type: String, enum: CHECK_SOURCES, default: CheckSource.CRON },

    checked: { type: Number, default: 0, min: 0 },
    online: { type: Number, default: 0, min: 0 },
    slow: { type: Number, default: 0, min: 0 },
    offline: { type: Number, default: 0, min: 0 },
    errorCount: { type: Number, default: 0, min: 0 },

    incidentsOpened: { type: Number, default: 0, min: 0 },
    incidentsResolved: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// The monitoring log page reads the most recent runs.
monitorRunSchema.index({ startedAt: -1 });

export const MonitorRun = model<IMonitorRun, MonitorRunModel>('MonitorRun', monitorRunSchema);
