import { Router } from 'express';

import { get, update } from '../controllers/settings.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { updateSettingsSchema } from '../validators/settings.validators.js';

const router = Router();

router.use(asyncHandler(requireAuth));

router.get('/', asyncHandler(get));

router.patch('/', validate({ body: updateSettingsSchema }), asyncHandler(update));

export default router;
