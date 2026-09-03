import { Router } from 'express';

import { siteAnalytics, siteHealthHistory } from '../controllers/analytics.controller.js';
import { checkNow } from '../controllers/monitor.controller.js';
import { create, getOne, list, remove, update } from '../controllers/site.controller.js';
import { manualCheckLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  healthHistoryQuerySchema,
  timeRangeQuerySchema,
} from '../validators/analytics.validators.js';
import {
  createSiteSchema,
  listSitesQuerySchema,
  siteIdParamSchema,
  updateSiteSchema,
} from '../validators/site.validators.js';

const router = Router();

// Every route below is user-scoped; none of them is reachable anonymously.
router.use(asyncHandler(requireAuth));

router.get('/', validate({ query: listSitesQuerySchema }), asyncHandler(list));

router.post('/', validate({ body: createSiteSchema }), asyncHandler(create));

router.get('/:id', validate({ params: siteIdParamSchema }), asyncHandler(getOne));

router.patch(
  '/:id',
  validate({ params: siteIdParamSchema, body: updateSiteSchema }),
  asyncHandler(update),
);

router.delete('/:id', validate({ params: siteIdParamSchema }), asyncHandler(remove));

// Rate limited on top of the global ceiling: each call makes an outbound
// request, so this caps both impatient clicking and any attempt to use the
// API as a traffic source.
router.post(
  '/:id/check',
  manualCheckLimiter,
  validate({ params: siteIdParamSchema }),
  asyncHandler(checkNow),
);

router.get(
  '/:id/health',
  validate({ params: siteIdParamSchema, query: healthHistoryQuerySchema }),
  asyncHandler(siteHealthHistory),
);

router.get(
  '/:id/analytics',
  validate({ params: siteIdParamSchema, query: timeRangeQuerySchema }),
  asyncHandler(siteAnalytics),
);

export default router;
