import { Router } from 'express';

import { create, list, remove, test, update } from '../controllers/channel.controller.js';
import { manualCheckLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  channelIdParamSchema,
  createChannelSchema,
  updateChannelSchema,
} from '../validators/channel.validators.js';

const router = Router();

router.use(asyncHandler(requireAuth));

router.get('/', asyncHandler(list));

router.post('/', validate({ body: createChannelSchema }), asyncHandler(create));

router.patch(
  '/:id',
  validate({ params: channelIdParamSchema, body: updateChannelSchema }),
  asyncHandler(update),
);

router.delete('/:id', validate({ params: channelIdParamSchema }), asyncHandler(remove));

// Rate limited alongside manual checks: both make an outbound request on
// demand, so both are ways to use the API as a traffic source.
router.post(
  '/:id/test',
  manualCheckLimiter,
  validate({ params: channelIdParamSchema }),
  asyncHandler(test),
);

export default router;
