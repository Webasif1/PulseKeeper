import { Router } from 'express';

import authRoutes from './auth.routes.js';
import healthRoutes from './health.routes.js';
import monitorRoutes from './monitor.routes.js';
import siteRoutes from './site.routes.js';

/**
 * API root. Every feature router mounts here, so `app.ts` stays free of route
 * detail and the full surface is visible in one file.
 */
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/sites', siteRoutes);
router.use('/monitor', monitorRoutes);

export default router;
