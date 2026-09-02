import { Router } from 'express';

import { login, logout, me, register } from '../controllers/auth.controller.js';
import { authLimiter, registerLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { loginSchema, registerSchema } from '../validators/auth.validators.js';

const router = Router();

router.post(
  '/register',
  registerLimiter,
  validate({ body: registerSchema }),
  asyncHandler(register),
);

router.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(login));

router.post('/logout', logout);

router.get('/me', asyncHandler(requireAuth), asyncHandler(me));

export default router;
