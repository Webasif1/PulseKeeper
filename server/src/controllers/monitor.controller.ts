import type { Request, Response } from 'express';

import { getAuthUser } from '../middleware/requireAuth.js';
import { validatedParams } from '../middleware/validate.js';
import { getSiteById } from '../services/site.service.js';
import { runManualCheck, runMonitoringSweep } from '../services/monitoring.service.js';
import { CheckSource } from '../types/domain.js';
import { AppError } from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { siteIdParamSchema } from '../validators/site.validators.js';

/**
 * External cron trigger (SPEC section 41), authenticated by shared secret.
 *
 * Returns the sweep summary in the shape SPEC section 40 specifies, so an
 * operator can read the response and see what happened.
 */
export async function triggerSweep(_req: Request, res: Response): Promise<void> {
  const summary = await runMonitoringSweep(CheckSource.EXTERNAL);

  sendSuccess(res, summary, 'Monitoring sweep complete');
}

/** "Check Now" for a single site (SPEC section 21). */
export async function checkNow(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);
  const { id } = validatedParams(req, siteIdParamSchema);

  const result = await runManualCheck(userId, id);

  if (result.threw) {
    // runManualCheck reports a missing site the same way it reports a failure,
    // so confirm which it was before answering.
    await getSiteById(userId, id);
    throw AppError.internal('The health check could not be completed');
  }

  const site = await getSiteById(userId, id);

  sendSuccess(res, { site }, 'Health check complete');
}
