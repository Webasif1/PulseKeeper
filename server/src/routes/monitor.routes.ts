import { Router } from 'express';

import { triggerSweep } from '../controllers/monitor.controller.js';
import { list as listRuns } from '../controllers/monitorRun.controller.js';
import { requireMonitorSecret } from '../middleware/monitorSecret.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { listMonitorRunsQuerySchema } from '../validators/analytics.validators.js';

const router = Router();

/**
 * POST /api/monitor/run
 *
 * For external cron services, where the backend sleeps and in-process
 * node-cron cannot be trusted. Authenticated by shared secret, not a session.
 */
router.post('/run', requireMonitorSecret, asyncHandler(triggerSweep));

/** The monitoring log page. Signed-in users only, but not user-scoped. */
router.get(
  '/runs',
  asyncHandler(requireAuth),
  validate({ query: listMonitorRunsQuerySchema }),
  asyncHandler(listRuns),
);

export default router;
