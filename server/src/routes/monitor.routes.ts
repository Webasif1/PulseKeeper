import { Router } from 'express';

import { triggerSweep } from '../controllers/monitor.controller.js';
import { requireMonitorSecret } from '../middleware/monitorSecret.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

/**
 * POST /api/monitor/run
 *
 * For external cron services, where the backend sleeps and in-process
 * node-cron cannot be trusted. Authenticated by shared secret, not a session.
 */
router.post('/run', requireMonitorSecret, asyncHandler(triggerSweep));

export default router;
