import { z } from 'zod';

import {
  MONITORING_INTERVALS,
  MONITORING_LIMITS,
  RETENTION_DAYS_OPTIONS,
} from '../constants/monitoring.js';
import { THEME_PREFERENCES } from '../types/domain.js';

/**
 * Settings update (SPEC section 36).
 *
 * Every field optional so the client can send only what changed, `.strict()` so
 * an unknown key is an error rather than a silent no-op, and bounds drawn from
 * the same constants the Mongoose schema uses — one source of truth for what a
 * legal threshold is.
 */
export const updateSettingsSchema = z
  .object({
    defaultIntervalMinutes: z
      .number()
      .int()
      .refine(
        (value) => (MONITORING_INTERVALS as readonly number[]).includes(value),
        `Interval must be one of: ${MONITORING_INTERVALS.join(', ')} minutes`,
      ),
    defaultTimeoutSeconds: z
      .number()
      .int()
      .min(MONITORING_LIMITS.timeoutSeconds.min)
      .max(MONITORING_LIMITS.timeoutSeconds.max),
    defaultSlowThresholdMs: z
      .number()
      .int()
      .min(MONITORING_LIMITS.slowThresholdMs.min)
      .max(MONITORING_LIMITS.slowThresholdMs.max),
    defaultFailureThreshold: z
      .number()
      .int()
      .min(MONITORING_LIMITS.failureThreshold.min)
      .max(MONITORING_LIMITS.failureThreshold.max),
    dataRetentionDays: z
      .number()
      .int()
      .refine(
        (value) => (RETENTION_DAYS_OPTIONS as readonly number[]).includes(value),
        `Retention must be one of: ${RETENTION_DAYS_OPTIONS.join(', ')} days`,
      ),
    notifications: z
      .object({
        onDown: z.boolean(),
        onUp: z.boolean(),
        onSlow: z.boolean(),
        onSslExpiry: z.boolean(),
      })
      .partial(),
    theme: z.enum(THEME_PREFERENCES as unknown as [string, ...string[]]),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'Provide at least one field to update');

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
