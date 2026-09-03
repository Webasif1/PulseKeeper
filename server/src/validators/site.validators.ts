import { z } from 'zod';

import { MONITORING_INTERVALS, MONITORING_LIMITS } from '../constants/monitoring.js';
import { SITE_STATUSES } from '../types/domain.js';
import { AppError } from '../utils/AppError.js';
import { parseAllowedUrl } from '../utils/urlGuard.js';

/**
 * URL field.
 *
 * Runs the synchronous half of the SSRF guard so the caller gets a precise,
 * field-level message. The resolving half runs in the service, because Zod
 * refinements here are synchronous and DNS is not.
 */
const guardedUrl = z
  .string()
  .trim()
  .min(1, 'URL is required')
  .superRefine((value, ctx) => {
    try {
      parseAllowedUrl(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof AppError ? error.message : 'Enter a valid URL',
      });
    }
  });

const tagsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, 'Tags cannot be empty')
      .max(MONITORING_LIMITS.maxTagLength, `Tags must be at most ${MONITORING_LIMITS.maxTagLength} characters`),
  )
  .max(MONITORING_LIMITS.maxTagsPerSite, `A site can have at most ${MONITORING_LIMITS.maxTagsPerSite} tags`)
  // Duplicate tags are a UI slip, not an error worth rejecting.
  .transform((tags) => [...new Set(tags.map((tag) => tag.toLowerCase()))]);

const monitoringFields = {
  monitoringEnabled: z.boolean(),
  intervalMinutes: z
    .number()
    .int()
    .refine(
      (value) => (MONITORING_INTERVALS as readonly number[]).includes(value),
      `Interval must be one of: ${MONITORING_INTERVALS.join(', ')} minutes`,
    ),
  timeoutSeconds: z
    .number()
    .int()
    .min(MONITORING_LIMITS.timeoutSeconds.min)
    .max(MONITORING_LIMITS.timeoutSeconds.max),
  slowThresholdMs: z
    .number()
    .int()
    .min(MONITORING_LIMITS.slowThresholdMs.min)
    .max(MONITORING_LIMITS.slowThresholdMs.max),
  failureThreshold: z
    .number()
    .int()
    .min(MONITORING_LIMITS.failureThreshold.min)
    .max(MONITORING_LIMITS.failureThreshold.max),
};

export const createSiteSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(MONITORING_LIMITS.maxNameLength),
    url: guardedUrl,
    healthEndpoint: guardedUrl.optional().or(z.literal('').transform(() => undefined)),
    description: z
      .string()
      .trim()
      .max(MONITORING_LIMITS.maxDescriptionLength)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    tags: tagsSchema.optional(),

    // Omitted fields fall back to the user's settings defaults in the service,
    // so the client never has to know them.
    monitoringEnabled: monitoringFields.monitoringEnabled.optional(),
    intervalMinutes: monitoringFields.intervalMinutes.optional(),
    timeoutSeconds: monitoringFields.timeoutSeconds.optional(),
    slowThresholdMs: monitoringFields.slowThresholdMs.optional(),
    failureThreshold: monitoringFields.failureThreshold.optional(),
  })
  .strict();

/** Every field editable (SPEC section 5), but at least one must be present. */
export const updateSiteSchema = createSiteSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Provide at least one field to update');

export const siteIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid site id'),
});

export const listSitesQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(SITE_STATUSES as [string, ...string[]]).optional(),
  tag: z.string().trim().max(MONITORING_LIMITS.maxTagLength).toLowerCase().optional(),
  sort: z
    .enum(['name', 'status', 'responseTime', 'uptime', 'lastChecked', 'createdAt'])
    .default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;
export type ListSitesQuery = z.infer<typeof listSitesQuerySchema>;
