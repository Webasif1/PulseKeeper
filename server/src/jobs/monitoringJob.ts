import cron, { type ScheduledTask } from 'node-cron';

import { env } from '../config/env.js';
import { isSweepInProgress, runMonitoringSweep } from '../services/monitoring.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('monitoring-job');

let task: ScheduledTask | undefined;

/**
 * Scheduled monitoring (SPEC section 40).
 *
 * One schedule, ticking every minute, that asks which sites are due — rather
 * than a cron entry per site. Per-site intervals are still honoured, and adding,
 * editing, or pausing a site needs no scheduler changes.
 *
 * Requires an always-on host. Where the backend sleeps, set
 * `MONITOR_ENABLED=false` and drive `POST /api/monitor/run` from an external
 * cron service instead.
 */
export function startMonitoringJob(): void {
  if (!env.MONITOR_ENABLED) {
    log.info('In-process monitoring is disabled (MONITOR_ENABLED=false)');
    return;
  }

  if (!cron.validate(env.MONITOR_CRON)) {
    log.error({ expression: env.MONITOR_CRON }, 'Invalid MONITOR_CRON, monitoring not started');
    return;
  }

  task = cron.schedule(env.MONITOR_CRON, () => {
    // A sweep slower than the tick interval must not stack: overlapping sweeps
    // would check the same sites twice and multiply outbound requests.
    if (isSweepInProgress()) {
      log.warn('Previous sweep still running, skipping this tick');
      return;
    }

    void runMonitoringSweep().catch((error: unknown) => {
      // The sweep contains its own per-site failures; reaching here means
      // something broader broke. Log it and let the next tick try again.
      log.error({ err: error }, 'Monitoring sweep failed');
    });
  });

  log.info({ expression: env.MONITOR_CRON }, 'Monitoring job scheduled');
}

export function stopMonitoringJob(): void {
  task?.stop();
  task = undefined;
}
