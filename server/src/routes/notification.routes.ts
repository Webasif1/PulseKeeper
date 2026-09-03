import { Router } from 'express';

import { list, markAllRead, markRead } from '../controllers/notification.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from '../validators/analytics.validators.js';

const router = Router();

router.use(asyncHandler(requireAuth));

router.get('/', validate({ query: listNotificationsQuerySchema }), asyncHandler(list));

router.patch('/read-all', asyncHandler(markAllRead));

router.patch(
  '/:id/read',
  validate({ params: notificationIdParamSchema }),
  asyncHandler(markRead),
);

export default router;
