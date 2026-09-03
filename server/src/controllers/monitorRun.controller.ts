import type { Request, Response } from 'express';
import type { Types } from 'mongoose';

import { getAuthUser } from '../middleware/requireAuth.js';
import { validatedQuery } from '../middleware/validate.js';
import { MonitorRun } from '../models/index.js';
import { sendPaginated } from '../utils/apiResponse.js';
import { listMonitorRunsQuerySchema } from '../validators/analytics.validators.js';

/**
 * The monitoring log (SPEC section 40).
 *
 * Requires a signed-in user but is not user-scoped, because a sweep is not
 * user-scoped: these rows hold aggregate counters only — never site names,
 * URLs, or ids — so they reveal nothing about anyone else's sites. See the
 * note on the MonitorRun model.
 */
export async function list(req: Request, res: Response): Promise<void> {
  getAuthUser(req);
  const query = validatedQuery(req, listMonitorRunsQuerySchema);

  const [runs, total] = await Promise.all([
    MonitorRun.find()
      .sort({ startedAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    MonitorRun.countDocuments(),
  ]);

  sendPaginated(
    res,
    runs.map((run) => ({
      id: (run._id as Types.ObjectId).toString(),
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs: run.durationMs,
      trigger: run.trigger,
      checked: run.checked,
      online: run.online,
      slow: run.slow,
      offline: run.offline,
      // Stored as errorCount because `errors` is a reserved Mongoose path;
      // exposed as `errors` to match SPEC section 40.
      errors: run.errorCount,
      incidentsOpened: run.incidentsOpened,
      incidentsResolved: run.incidentsResolved,
    })),
    total,
    query.page,
    query.limit,
    'Monitoring runs',
  );
}
