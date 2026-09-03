import cron, { type ScheduledTask } from 'node-cron';

import { env } from '../config/env.js';
import { HealthCheck, MonitorRun, Settings } from '../models/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('cleanup-job');

let task: ScheduledTask | undefined;

/** Monitor-run records are operational telemetry; a fixed 30 days is plenty. */
const MONITOR_RUN_RETENTION_DAYS = 30;

/**
 * Delete health checks past each user's retention window (SPEC section 23).
 *
 * Retention is per-user, so the sweep groups users by their configured window
 * and issues one delete per distinct value — a handful of queries rather than
 * one per user.
 */
export async function runRetentionCleanup(): Promise<{
  deletedChecks: number;
  deletedRuns: number;
}> {
  const settings = await Settings.find().select('userId dataRetentionDays').lean();

  const usersByRetention = new Map<number, string[]>();
  for (const entry of settings) {
    const bucket = usersByRetention.get(entry.dataRetentionDays) ?? [];
    bucket.push(entry.userId.toString());
    usersByRetention.set(entry.dataRetentionDays, bucket);
  }

  let deletedChecks = 0;

  for (const [retentionDays, userIds] of usersByRetention) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await HealthCheck.deleteMany({
      userId: { $in: userIds },
      checkedAt: { $lt: cutoff },
    });

    deletedChecks += result.deletedCount ?? 0;
  }

  const runCutoff = new Date(Date.now() - MONITOR_RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const runResult = await MonitorRun.deleteMany({ startedAt: { $lt: runCutoff } });

  const deletedRuns = runResult.deletedCount ?? 0;

  if (deletedChecks > 0 || deletedRuns > 0) {
    log.info({ deletedChecks, deletedRuns }, 'Retention cleanup complete');
  }

  return { deletedChecks, deletedRuns };
}

export function startCleanupJob(): void {
  if (!cron.validate(env.CLEANUP_CRON)) {
    log.error({ expression: env.CLEANUP_CRON }, 'Invalid CLEANUP_CRON, cleanup not started');
    return;
  }

  task = cron.schedule(env.CLEANUP_CRON, () => {
    void runRetentionCleanup().catch((error: unknown) => {
      log.error({ err: error }, 'Retention cleanup failed');
    });
  });

  log.info({ expression: env.CLEANUP_CRON }, 'Cleanup job scheduled');
}

export function stopCleanupJob(): void {
  task?.stop();
  task = undefined;
}
