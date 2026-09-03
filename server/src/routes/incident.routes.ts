import { Router } from 'express';

import { getOne, list } from '../controllers/incident.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  incidentIdParamSchema,
  listIncidentsQuerySchema,
} from '../validators/analytics.validators.js';

const router = Router();

router.use(asyncHandler(requireAuth));

router.get('/', validate({ query: listIncidentsQuerySchema }), asyncHandler(list));

router.get('/:id', validate({ params: incidentIdParamSchema }), asyncHandler(getOne));

export default router;
