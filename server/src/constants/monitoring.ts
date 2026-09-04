/**
 * Monitoring defaults and allowed values.
 *
 * SPEC section 20 requires these to be configurable rather than scattered as
 * literals, so every model default, validator bound, and seed value reads from
 * here.
 */

/** Selectable check intervals, in minutes (SPEC section 20). */
export const MONITORING_INTERVALS = [1, 5, 10, 15, 30, 60] as const;
export type MonitoringInterval = (typeof MONITORING_INTERVALS)[number];

/** Selectable health-check retention windows, in days (SPEC section 23). */
export const RETENTION_DAYS_OPTIONS = [7, 30, 90, 180] as const;
export type RetentionDays = (typeof RETENTION_DAYS_OPTIONS)[number];

export const MONITORING_DEFAULTS = {
  intervalMinutes: 5,
  timeoutSeconds: 10,
  slowThresholdMs: 3000,
  failureThreshold: 3,
  retentionDays: 30,
} as const;

/**
 * When to warn about an expiring TLS certificate, in days remaining.
 *
 * Descending, and warned at most once per band: a certificate quietly expiring
 * is a self-inflicted outage that monitoring should have caught, but a daily
 * reminder for thirty days is how people learn to ignore alerts. 30 gives time
 * to renew, 14 is a nudge, 7 is urgent, 1 is an emergency.
 */
export const SSL_WARNING_DAYS = [30, 14, 7, 1] as const;

/** Bounds enforced by both the Zod validators and the Mongoose schemas. */
export const MONITORING_LIMITS = {
  timeoutSeconds: { min: 1, max: 60 },
  slowThresholdMs: { min: 100, max: 60_000 },
  failureThreshold: { min: 1, max: 10 },
  maxTagsPerSite: 10,
  maxTagLength: 24,
  maxNameLength: 80,
  maxDescriptionLength: 280,
  maxUrlLength: 2048,
} as const;
