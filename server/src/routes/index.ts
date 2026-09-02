import { Router } from 'express';

import healthRoutes from './health.routes.js';

/**
 * API root. Every feature router mounts here, so `app.ts` stays free of route
 * detail and the full surface is visible in one file.
 */
const router = Router();

router.use('/health', healthRoutes);

export default router;
