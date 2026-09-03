import { startCleanupJob, stopCleanupJob } from './cleanupJob.js';
import { startMonitoringJob, stopMonitoringJob } from './monitoringJob.js';

/**
 * Start the scheduled jobs.
 *
 * Called from `server.ts` only, never from `app.ts`: tests build the app and
 * must not acquire a cron schedule that outlives them.
 */
export function startJobs(): void {
  startMonitoringJob();
  startCleanupJob();
}

export function stopJobs(): void {
  stopMonitoringJob();
  stopCleanupJob();
}
