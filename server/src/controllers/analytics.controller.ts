import type { Request, Response } from 'express';
import { Types } from 'mongoose';

import type { TimeRangeKey } from '../constants/analytics.js';
import { getAuthUser } from '../middleware/requireAuth.js';
import { validatedParams, validatedQuery } from '../middleware/validate.js';
import { HealthCheck } from '../models/index.js';
import {
  getDashboardStats,
  getPlatformAnalytics,
  getSiteAnalytics,
} from '../services/analytics.service.js';
import { getSiteById } from '../services/site.service.js';
import { sendPaginated, sendSuccess } from '../utils/apiResponse.js';
import {
  healthHistoryQuerySchema,
  timeRangeQuerySchema,
} from '../validators/analytics.validators.js';
import { siteIdParamSchema } from '../validators/site.validators.js';

export async function dashboardStats(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);

  const stats = await getDashboardStats(userId);

  sendSuccess(res, stats, 'Dashboard stats');
}

export async function platformAnalytics(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);
  const { range } = validatedQuery(req, timeRangeQuerySchema);

  const analytics = await getPlatformAnalytics(userId, range as TimeRangeKey);

  sendSuccess(res, analytics, 'Analytics');
}

export async function siteAnalytics(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);
  const { id } = validatedParams(req, siteIdParamSchema);
  const { range } = validatedQuery(req, timeRangeQuerySchema);

  // Confirms ownership before any aggregation runs, so an unauthorised id
  // cannot be used to measure query timings.
  await getSiteById(userId, id);

  const analytics = await getSiteAnalytics(userId, id, range as TimeRangeKey);

  sendSuccess(res, analytics, 'Site analytics');
}

/** Raw check history, paginated (SPEC section 24). */
export async function siteHealthHistory(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);
  const { id } = validatedParams(req, siteIdParamSchema);
  const query = validatedQuery(req, healthHistoryQuerySchema);

  await getSiteById(userId, id);

  const filter: Record<string, unknown> = { siteId: new Types.ObjectId(id) };
  if (query.successOnly) filter.success = true;
  if (query.failedOnly) filter.success = false;

  const [items, total] = await Promise.all([
    HealthCheck.find(filter)
      .sort({ checkedAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .select('checkedAt success statusCode responseTimeMs errorType errorMessage source')
      .lean(),
    HealthCheck.countDocuments(filter),
  ]);

  sendPaginated(
    res,
    items.map((check) => ({
      id: (check._id as Types.ObjectId).toString(),
      checkedAt: check.checkedAt,
      success: check.success,
      statusCode: check.statusCode,
      responseTimeMs: check.responseTimeMs,
      errorType: check.errorType,
      errorMessage: check.errorMessage,
      source: check.source,
    })),
    total,
    query.page,
    query.limit,
    'Health checks',
  );
}
