import { Router } from 'express';

import { create, getOne, list, remove, update } from '../controllers/site.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
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

export default router;
