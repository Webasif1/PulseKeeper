import { z } from 'zod';

import { TIME_RANGE_KEYS } from '../constants/analytics.js';
import { INCIDENT_STATUSES } from '../types/domain.js';

export const timeRangeQuerySchema = z.object({
  range: z.enum(TIME_RANGE_KEYS as [string, ...string[]]).default('24h'),
});

export const healthHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // Capped: the timeline needs tens of rows, not thousands, and an unbounded
  // limit would let one request pull a site's entire history.
  limit: z.coerce.number().int().min(1).max(200).default(50),
  successOnly: z.coerce.boolean().optional(),
  failedOnly: z.coerce.boolean().optional(),
});

export const listIncidentsQuerySchema = z.object({
  status: z
    .enum([...INCIDENT_STATUSES, 'ALL'] as unknown as [string, ...string[]])
    .default('ALL'),
  siteId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const incidentIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid incident id'),
});

export const listNotificationsQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().default(false),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const notificationIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid notification id'),
});

export const listMonitorRunsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
