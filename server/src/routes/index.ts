import { Router } from 'express';

import authRoutes from './auth.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import healthRoutes from './health.routes.js';
import incidentRoutes from './incident.routes.js';
import monitorRoutes from './monitor.routes.js';
import notificationRoutes from './notification.routes.js';
import settingsRoutes from './settings.routes.js';
import siteRoutes from './site.routes.js';

/**
 * API root. Every feature router mounts here, so `app.ts` stays free of route
 * detail and the full surface is visible in one file.
 */
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/sites', siteRoutes);
router.use('/incidents', incidentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/settings', settingsRoutes);
router.use('/monitor', monitorRoutes);

// /api/dashboard/stats and /api/dashboard/analytics. The analytics page reads
// the same router because both are account-wide views rather than per-site.
router.use('/dashboard', dashboardRoutes);

export default router;
