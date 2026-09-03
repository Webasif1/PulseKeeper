import { Router } from 'express';

import { dashboardStats, platformAnalytics } from '../controllers/analytics.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { timeRangeQuerySchema } from '../validators/analytics.validators.js';

const router = Router();

router.use(asyncHandler(requireAuth));

router.get('/stats', asyncHandler(dashboardStats));

router.get('/analytics', validate({ query: timeRangeQuerySchema }), asyncHandler(platformAnalytics));

export default router;
