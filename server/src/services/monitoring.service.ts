import type { Types } from 'mongoose';

import { env } from '../config/env.js';
import { HealthCheck, MonitorRun, Site, type ISite } from '../models/index.js';
import { CheckSource, SiteStatus, type CheckSourceValue } from '../types/domain.js';
import { runWithConcurrency } from '../utils/concurrency.js';
import { createLogger } from '../utils/logger.js';
import { runHealthCheck } from './healthCheck.service.js';
import { handleFailedCheck, handleSuccessfulCheck } from './incident.service.js';
import { handleCertificate } from './ssl.service.js';

const log = createLogger('monitor');

type SiteWithId = ISite & { _id: Types.ObjectId };

export interface SweepSummary {
  runId: string;
  checked: number;
  online: number;
  slow: number;
  offline: number;
  /** Sites whose check threw unexpectedly, rather than failing normally. */
  errors: number;
  incidentsOpened: number;
  incidentsResolved: number;
  durationMs: number;
}

/**
 * Sites due for a check.
 *
 * `$expr` is needed because the comparison is field-relative: each site has its
 * own interval, so "due" means `lastCheckedAt + intervalMinutes <= now`. The
 * alternative — one cron schedule per site — would mean re-registering
 * schedules whenever a site is added, edited, or paused.
 */
export async function findDueSites(now: Date = new Date()): Promise<SiteWithId[]> {
  const sites = await Site.find({
    monitoringEnabled: true,
    // Demo sites are illustrations, not real targets. Their hostnames are
    // under example.com, which RFC 2606 reserves and which therefore cannot
    // resolve — so checking them would fail every time and overwrite the
    // seeded history with DNS errors within a minute of seeding it.
    isDemo: { $ne: true },
    $expr: {
      $or: [
        { $eq: [{ $ifNull: ['$lastCheckedAt', null] }, null] },
        {
          $lte: [
            '$lastCheckedAt',
            { $subtract: [now, { $multiply: ['$intervalMinutes', 60_000] }] },
          ],
        },
      ],
    },
  })
    // Oldest first, so a backlog drains fairly instead of starving the same
    // sites every sweep.
    .sort({ lastCheckedAt: 1 })
    .lean();

  return sites as SiteWithId[];
}

interface SiteCheckResult {
  status: (typeof SiteStatus)[keyof typeof SiteStatus];
  incidentOpened: boolean;
  incidentResolved: boolean;
  threw: boolean;
}

/**
 * Check one site and record everything that follows from it.
 *
 * Returns a result rather than throwing (SPEC section 43): one site failing
 * must never abort the sweep, so the caller can count outcomes uniformly.
 */
export async function checkSite(
  site: SiteWithId,
  source: CheckSourceValue = CheckSource.CRON,
): Promise<SiteCheckResult> {
  const checkUrl = site.healthEndpoint?.trim() || site.url;

  try {
    const outcome = await runHealthCheck(checkUrl, {
      timeoutSeconds: site.timeoutSeconds,
      slowThresholdMs: site.slowThresholdMs,
    });

    const checkedAt = new Date();

    await HealthCheck.create({
      siteId: site._id,
      userId: site.userId,
      checkedAt,
      success: outcome.success,
      statusCode: outcome.statusCode,
      responseTimeMs: outcome.responseTimeMs,
      errorType: outcome.errorType,
      errorMessage: outcome.errorMessage,
      source,
    });

    // The in-memory copy is updated too, because the incident service reads
    // consecutiveFailures to decide whether the threshold has been reached.
    const consecutiveFailures = outcome.success ? 0 : site.consecutiveFailures + 1;
    const updatedSite: SiteWithId = { ...site, consecutiveFailures };

    const transition = outcome.success
      ? await handleSuccessfulCheck(updatedSite)
      : await handleFailedCheck(
          updatedSite,
          outcome.errorMessage ?? 'Health check failed',
          outcome.errorType,
          outcome.statusCode,
        );

    const uptimePercentage = await calculateRecentUptime(site._id);

    // Folded into the single site update below rather than written separately:
    // the certificate came from the connection this check already made.
    const sslUpdate = outcome.tls ? await handleCertificate(site, outcome.tls) : {};

    await Site.updateOne(
      { _id: site._id },
      {
        $set: {
          ...sslUpdate,
          currentStatus: outcome.status,
          currentResponseTime: outcome.responseTimeMs ?? null,
          currentStatusCode: outcome.statusCode ?? null,
          lastCheckedAt: checkedAt,
          consecutiveFailures,
          uptimePercentage,
          ...(outcome.success ? { lastSuccessAt: checkedAt } : {}),
          ...(transition.opened ? { activeIncidentId: transition.incidentId } : {}),
          ...(transition.resolved ? { activeIncidentId: null } : {}),
        },
      },
    );

    return {
      status: outcome.status,
      incidentOpened: transition.opened,
      incidentResolved: transition.resolved,
      threw: false,
    };
  } catch (error) {
    // Reaching here means a bug or a database problem, not an unreachable
    // site — those are ordinary results. Still contained, so the sweep goes on.
    log.error({ err: error, siteId: site._id.toString() }, 'Site check threw unexpectedly');

    await Site.updateOne({ _id: site._id }, { $set: { lastCheckedAt: new Date() } }).catch(
      () => undefined,
    );

    return {
      status: SiteStatus.UNKNOWN,
      incidentOpened: false,
      incidentResolved: false,
      threw: true,
    };
  }
}

/**
 * Rolling 24-hour uptime for the site card.
 *
 * Computed from check history rather than current status (SPEC section 14).
 * Detail pages recompute over their own windows; this is the cheap figure the
 * dashboard shows without an aggregation per site per poll.
 */
async function calculateRecentUptime(siteId: Types.ObjectId): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [totals] = await HealthCheck.aggregate<{ total: number; successful: number }>([
    { $match: { siteId, checkedAt: { $gte: since } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        successful: { $sum: { $cond: ['$success', 1, 0] } },
      },
    },
  ]);

  if (!totals || totals.total === 0) return 0;

  return Math.round((totals.successful / totals.total) * 10_000) / 100;
}

/** Guards against a slow sweep overlapping the next cron tick. */
let sweepInProgress = false;

export function isSweepInProgress(): boolean {
  return sweepInProgress;
}

/**
 * Run one monitoring sweep (SPEC section 40).
 *
 * Records a MonitorRun document so the monitoring log survives restarts and log
 * rotation.
 */
export async function runMonitoringSweep(
  trigger: CheckSourceValue = CheckSource.CRON,
): Promise<SweepSummary> {
  const startedAt = new Date();
  sweepInProgress = true;

  try {
    const sites = await findDueSites(startedAt);

    // An idle cron tick is not worth a row. The scheduler fires every minute
    // and most ticks find nothing due, so persisting them would add ~1,400
    // empty records a day and bury the runs that actually did something. A
    // manual or external trigger is always recorded, because whoever pressed
    // the button is entitled to see that it ran.
    if (sites.length === 0 && trigger === CheckSource.CRON) {
      log.debug({ trigger }, 'Monitoring sweep found no sites due');
      return {
        runId: '',
        checked: 0,
        online: 0,
        slow: 0,
        offline: 0,
        errors: 0,
        incidentsOpened: 0,
        incidentsResolved: 0,
        durationMs: Date.now() - startedAt.getTime(),
      };
    }

    const run = await MonitorRun.create({ startedAt, trigger });

    const results = await runWithConcurrency(
      sites.map((site) => () => checkSite(site, trigger)),
      env.MONITOR_CONCURRENCY,
    );

    const summary = {
      checked: results.length,
      online: results.filter((result) => result.status === SiteStatus.ONLINE).length,
      slow: results.filter((result) => result.status === SiteStatus.SLOW).length,
      offline: results.filter((result) => result.status === SiteStatus.OFFLINE).length,
      errors: results.filter((result) => result.threw).length,
      incidentsOpened: results.filter((result) => result.incidentOpened).length,
      incidentsResolved: results.filter((result) => result.incidentResolved).length,
    };

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    await MonitorRun.updateOne(
      { _id: run._id },
      {
        $set: {
          finishedAt,
          durationMs,
          checked: summary.checked,
          online: summary.online,
          slow: summary.slow,
          offline: summary.offline,
          errorCount: summary.errors,
          incidentsOpened: summary.incidentsOpened,
          incidentsResolved: summary.incidentsResolved,
        },
      },
    );

    log.info({ ...summary, durationMs, trigger }, 'Monitoring sweep complete');

    return { runId: run.id as string, ...summary, durationMs };
  } finally {
    sweepInProgress = false;
  }
}

/**
 * Check one site immediately, for "Check Now" (SPEC section 21).
 *
 * Scoped by userId like every other site query, so the endpoint cannot be used
 * to probe another account's sites.
 */
export async function runManualCheck(userId: string, siteId: string): Promise<SiteCheckResult> {
  const site = (await Site.findOne({ _id: siteId, userId }).lean()) as SiteWithId | null;

  if (!site) {
    return {
      status: SiteStatus.UNKNOWN,
      incidentOpened: false,
      incidentResolved: false,
      threw: true,
    };
  }

  return checkSite(site, CheckSource.MANUAL);
}
