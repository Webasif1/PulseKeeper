import { Types, type PipelineStage } from 'mongoose';

import {
  TIME_RANGES,
  TIMELINE_LENGTH,
  UPTIME_WINDOWS,
  type TimeRangeKey,
} from '../constants/analytics.js';
import { HealthCheck, Incident, Site } from '../models/index.js';
import { IncidentStatus, SiteStatus } from '../types/domain.js';

/**
 * Analytics.
 *
 * Two rules run through every function here:
 *
 *  1. **Uptime comes from history, never from current status** (SPEC section 14).
 *     A site that is up right now is not therefore at 100%.
 *  2. **Aggregate in MongoDB, not in Node.** These queries can span tens of
 *     thousands of checks; pulling them into the process to reduce them would
 *     be slower and would scale with history rather than with the answer.
 */

/**
 * Uptime per window.
 *
 * `null` means the window contained no checks, which is not the same as 0%.
 * A site that was down for a whole day genuinely is at 0%, and reporting both
 * cases as the same number would either hide a total outage or invent one.
 */
export interface UptimeWindows {
  '24h': number | null;
  '7d': number | null;
  '30d': number | null;
  '90d': number | null;
}

export interface ResponseTimePoint {
  timestamp: Date;
  avg: number;
  min: number;
  max: number;
  count: number;
}

export interface SiteStats {
  totalChecks: number;
  failedChecks: number;
  uptimePercentage: number;
  avgResponseTime: number | null;
  minResponseTime: number | null;
  maxResponseTime: number | null;
  downtimeSeconds: number;
}

export interface TimelineEntry {
  checkedAt: Date;
  success: boolean;
  statusCode?: number;
  responseTimeMs?: number;
  errorType?: string;
}

export interface StatusDistributionEntry {
  statusCode: number | null;
  count: number;
}

export interface SiteAnalytics {
  range: TimeRangeKey;
  from: Date;
  to: Date;
  stats: SiteStats;
  uptime: UptimeWindows;
  responseTime: ResponseTimePoint[];
  statusDistribution: StatusDistributionEntry[];
  timeline: TimelineEntry[];
}

function rangeStart(range: TimeRangeKey, now: Date): Date {
  return new Date(now.getTime() - TIME_RANGES[range].milliseconds);
}

/** Round to two decimals; uptime is meaningless at higher precision. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Uptime across all four windows in one round trip.
 *
 * `$facet` runs the four pipelines over a single pass of the 90-day match,
 * rather than issuing four separate queries that each re-scan the index.
 */
export async function calculateUptimeWindows(
  match: Record<string, unknown>,
  now: Date = new Date(),
): Promise<UptimeWindows> {
  const facets: Record<string, PipelineStage.FacetPipelineStage[]> = {};

  for (const window of UPTIME_WINDOWS) {
    facets[window] = [
      { $match: { checkedAt: { $gte: rangeStart(window, now) } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          successful: { $sum: { $cond: ['$success', 1, 0] } },
        },
      },
    ];
  }

  const [result] = await HealthCheck.aggregate([
    // The widest window bounds the scan; each facet narrows from there.
    { $match: { ...match, checkedAt: { $gte: rangeStart('90d', now) } } },
    { $facet: facets },
  ]);

  const uptime = {} as UptimeWindows;

  for (const window of UPTIME_WINDOWS) {
    const bucket = (result?.[window] as Array<{ total: number; successful: number }>)?.[0];
    uptime[window] =
      bucket && bucket.total > 0 ? round2((bucket.successful / bucket.total) * 100) : null;
  }

  return uptime;
}

/** Downsampled response-time series for the chart (SPEC section 13). */
export async function getResponseTimeSeries(
  match: Record<string, unknown>,
  range: TimeRangeKey,
  now: Date = new Date(),
): Promise<ResponseTimePoint[]> {
  const { bucket } = TIME_RANGES[range];

  const points = await HealthCheck.aggregate<{
    _id: Date;
    avg: number;
    min: number;
    max: number;
    count: number;
  }>([
    {
      $match: {
        ...match,
        checkedAt: { $gte: rangeStart(range, now) },
        // Failed checks have no meaningful duration, so including them would
        // drag the average toward zero and hide real slowness.
        success: true,
        responseTimeMs: { $ne: null },
      },
    },
    {
      $group: {
        _id: { $dateTrunc: { date: '$checkedAt', unit: bucket.unit, binSize: bucket.binSize } },
        avg: { $avg: '$responseTimeMs' },
        min: { $min: '$responseTimeMs' },
        max: { $max: '$responseTimeMs' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return points.map((point) => ({
    timestamp: point._id,
    avg: Math.round(point.avg),
    min: point.min,
    max: point.max,
    count: point.count,
  }));
}

/** HTTP status distribution (SPEC section 12). */
export async function getStatusDistribution(
  match: Record<string, unknown>,
  range: TimeRangeKey,
  now: Date = new Date(),
): Promise<StatusDistributionEntry[]> {
  const rows = await HealthCheck.aggregate<{ _id: number | null; count: number }>([
    { $match: { ...match, checkedAt: { $gte: rangeStart(range, now) } } },
    { $group: { _id: '$statusCode', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  return rows.map((row) => ({ statusCode: row._id ?? null, count: row.count }));
}

/**
 * Downtime in the window, from incident records.
 *
 * Incidents are the source of truth for downtime rather than failed-check
 * counts: checks are samples, and multiplying them by an interval would only
 * estimate what the incident already knows exactly. An incident still open is
 * counted up to now.
 */
export async function getDowntimeSeconds(
  match: Record<string, unknown>,
  range: TimeRangeKey,
  now: Date = new Date(),
): Promise<number> {
  const from = rangeStart(range, now);

  const incidents = await Incident.find({
    ...match,
    $or: [{ resolvedAt: { $gte: from } }, { status: IncidentStatus.ACTIVE }],
  })
    .select('startedAt resolvedAt status')
    .lean();

  return incidents.reduce((total, incident) => {
    // Clip to the window so a long outage that began before it does not
    // report more downtime than the window contains.
    const start = Math.max(incident.startedAt.getTime(), from.getTime());
    const end = (incident.resolvedAt ?? now).getTime();
    return total + Math.max(0, Math.round((end - start) / 1000));
  }, 0);
}

/** Counters for the statistics panel. */
export async function getSiteStats(
  match: Record<string, unknown>,
  range: TimeRangeKey,
  now: Date = new Date(),
): Promise<SiteStats> {
  const [totals] = await HealthCheck.aggregate<{
    totalChecks: number;
    failedChecks: number;
    avgResponseTime: number | null;
    minResponseTime: number | null;
    maxResponseTime: number | null;
  }>([
    { $match: { ...match, checkedAt: { $gte: rangeStart(range, now) } } },
    {
      $group: {
        _id: null,
        totalChecks: { $sum: 1 },
        failedChecks: { $sum: { $cond: ['$success', 0, 1] } },
        // Successful checks only: a timeout has no duration to average.
        avgResponseTime: {
          $avg: { $cond: ['$success', '$responseTimeMs', null] },
        },
        minResponseTime: { $min: { $cond: ['$success', '$responseTimeMs', null] } },
        maxResponseTime: { $max: { $cond: ['$success', '$responseTimeMs', null] } },
      },
    },
  ]);

  const downtimeSeconds = await getDowntimeSeconds(match, range, now);

  if (!totals || totals.totalChecks === 0) {
    return {
      totalChecks: 0,
      failedChecks: 0,
      uptimePercentage: 0,
      avgResponseTime: null,
      minResponseTime: null,
      maxResponseTime: null,
      downtimeSeconds,
    };
  }

  const successful = totals.totalChecks - totals.failedChecks;

  return {
    totalChecks: totals.totalChecks,
    failedChecks: totals.failedChecks,
    uptimePercentage: round2((successful / totals.totalChecks) * 100),
    avgResponseTime:
      totals.avgResponseTime === null ? null : Math.round(totals.avgResponseTime),
    minResponseTime: totals.minResponseTime,
    maxResponseTime: totals.maxResponseTime,
    downtimeSeconds,
  };
}

/** The most recent checks, for the health timeline (SPEC section 15). */
export async function getTimeline(
  siteId: Types.ObjectId,
  limit = TIMELINE_LENGTH,
): Promise<TimelineEntry[]> {
  const checks = await HealthCheck.find({ siteId })
    .sort({ checkedAt: -1 })
    .limit(limit)
    .select('checkedAt success statusCode responseTimeMs errorType')
    .lean();

  // Newest first from the index, oldest first for the chart.
  return checks.reverse().map((check) => ({
    checkedAt: check.checkedAt,
    success: check.success,
    ...(check.statusCode !== undefined ? { statusCode: check.statusCode } : {}),
    ...(check.responseTimeMs !== undefined ? { responseTimeMs: check.responseTimeMs } : {}),
    ...(check.errorType ? { errorType: check.errorType } : {}),
  }));
}

/** Everything the site detail page needs (SPEC section 12). */
export async function getSiteAnalytics(
  userId: string,
  siteId: string,
  range: TimeRangeKey,
  now: Date = new Date(),
): Promise<SiteAnalytics> {
  const siteObjectId = new Types.ObjectId(siteId);
  const match = { siteId: siteObjectId, userId: new Types.ObjectId(userId) };

  const [stats, uptime, responseTime, statusDistribution, timeline] = await Promise.all([
    getSiteStats(match, range, now),
    calculateUptimeWindows(match, now),
    getResponseTimeSeries(match, range, now),
    getStatusDistribution(match, range, now),
    getTimeline(siteObjectId),
  ]);

  return {
    range,
    from: rangeStart(range, now),
    to: now,
    stats,
    uptime,
    responseTime,
    statusDistribution,
    timeline,
  };
}

export interface DashboardStats {
  totals: {
    sites: number;
    online: number;
    slow: number;
    offline: number;
    paused: number;
    unknown: number;
  };
  avgResponseTime: number | null;
  uptime: UptimeWindows;
  activeIncidents: number;
  responseTime: ResponseTimePoint[];
}

/** The dashboard header and charts (SPEC section 10). */
export async function getDashboardStats(
  userId: string,
  now: Date = new Date(),
): Promise<DashboardStats> {
  const userObjectId = new Types.ObjectId(userId);
  const match = { userId: userObjectId };

  const [statusCounts, uptime, responseTime, activeIncidents, avgRow] = await Promise.all([
    Site.aggregate<{ _id: string; count: number }>([
      { $match: { userId: userObjectId } },
      { $group: { _id: '$currentStatus', count: { $sum: 1 } } },
    ]),
    calculateUptimeWindows(match, now),
    getResponseTimeSeries(match, '24h', now),
    Incident.countDocuments({ userId: userObjectId, status: IncidentStatus.ACTIVE }),
    HealthCheck.aggregate<{ avg: number | null }>([
      {
        $match: {
          userId: userObjectId,
          checkedAt: { $gte: new Date(now.getTime() - TIME_RANGES['24h'].milliseconds) },
          success: true,
        },
      },
      { $group: { _id: null, avg: { $avg: '$responseTimeMs' } } },
    ]),
  ]);

  const byStatus = new Map(statusCounts.map((row) => [row._id, row.count]));
  const countFor = (status: string): number => byStatus.get(status) ?? 0;

  return {
    totals: {
      sites: statusCounts.reduce((sum, row) => sum + row.count, 0),
      online: countFor(SiteStatus.ONLINE),
      slow: countFor(SiteStatus.SLOW),
      offline: countFor(SiteStatus.OFFLINE),
      paused: countFor(SiteStatus.PAUSED),
      unknown: countFor(SiteStatus.UNKNOWN),
    },
    avgResponseTime: avgRow[0]?.avg === null || avgRow[0]?.avg === undefined
      ? null
      : Math.round(avgRow[0].avg),
    uptime,
    activeIncidents,
    responseTime,
  };
}

export interface SiteRanking {
  siteId: string;
  name: string;
  url: string;
  value: number;
}

export interface PlatformAnalytics {
  range: TimeRangeKey;
  totals: {
    sites: number;
    checks: number;
    failedChecks: number;
    incidents: number;
    downtimeSeconds: number;
  };
  uptime: UptimeWindows;
  responseTime: ResponseTimePoint[];
  statusDistribution: StatusDistributionEntry[];
  mostReliable: SiteRanking[];
  slowest: SiteRanking[];
  mostFailing: SiteRanking[];
}

/**
 * Per-site rankings for the analytics page (SPEC section 35).
 *
 * One pass grouped by site, then sorted three ways in Node — the result set is
 * one row per site, so sorting it here is cheaper than three more aggregations.
 */
async function getSiteRankings(
  userId: Types.ObjectId,
  range: TimeRangeKey,
  now: Date,
): Promise<{ mostReliable: SiteRanking[]; slowest: SiteRanking[]; mostFailing: SiteRanking[] }> {
  const rows = await HealthCheck.aggregate<{
    _id: Types.ObjectId;
    total: number;
    failed: number;
    avgResponseTime: number | null;
    site: { name: string; url: string } | null;
  }>([
    { $match: { userId, checkedAt: { $gte: rangeStart(range, now) } } },
    {
      $group: {
        _id: '$siteId',
        total: { $sum: 1 },
        failed: { $sum: { $cond: ['$success', 0, 1] } },
        avgResponseTime: { $avg: { $cond: ['$success', '$responseTimeMs', null] } },
      },
    },
    {
      $lookup: {
        from: 'sites',
        localField: '_id',
        foreignField: '_id',
        pipeline: [{ $project: { name: 1, url: 1 } }],
        as: 'site',
      },
    },
    { $set: { site: { $first: '$site' } } },
    // A site deleted mid-window leaves checks behind only until the cascade
    // runs; skip anything without a site rather than rendering a blank row.
    { $match: { site: { $ne: null } } },
  ]);

  const enriched = rows.map((row) => ({
    siteId: row._id.toString(),
    name: row.site?.name ?? 'Unknown',
    url: row.site?.url ?? '',
    uptime: row.total > 0 ? round2(((row.total - row.failed) / row.total) * 100) : 0,
    avgResponseTime: row.avgResponseTime === null ? null : Math.round(row.avgResponseTime),
    failed: row.failed,
  }));

  return {
    mostReliable: [...enriched]
      .sort((a, b) => b.uptime - a.uptime)
      .slice(0, 5)
      .map(({ siteId, name, url, uptime }) => ({ siteId, name, url, value: uptime })),

    slowest: [...enriched]
      .filter((entry) => entry.avgResponseTime !== null)
      .sort((a, b) => (b.avgResponseTime ?? 0) - (a.avgResponseTime ?? 0))
      .slice(0, 5)
      .map(({ siteId, name, url, avgResponseTime }) => ({
        siteId,
        name,
        url,
        value: avgResponseTime ?? 0,
      })),

    mostFailing: [...enriched]
      .filter((entry) => entry.failed > 0)
      .sort((a, b) => b.failed - a.failed)
      .slice(0, 5)
      .map(({ siteId, name, url, failed }) => ({ siteId, name, url, value: failed })),
  };
}

/** The analytics page (SPEC section 35). */
export async function getPlatformAnalytics(
  userId: string,
  range: TimeRangeKey,
  now: Date = new Date(),
): Promise<PlatformAnalytics> {
  const userObjectId = new Types.ObjectId(userId);
  const match = { userId: userObjectId };

  const [stats, uptime, responseTime, statusDistribution, rankings, sites, incidents] =
    await Promise.all([
      getSiteStats(match, range, now),
      calculateUptimeWindows(match, now),
      getResponseTimeSeries(match, range, now),
      getStatusDistribution(match, range, now),
      getSiteRankings(userObjectId, range, now),
      Site.countDocuments({ userId: userObjectId }),
      Incident.countDocuments({
        userId: userObjectId,
        startedAt: { $gte: rangeStart(range, now) },
      }),
    ]);

  return {
    range,
    totals: {
      sites,
      checks: stats.totalChecks,
      failedChecks: stats.failedChecks,
      incidents,
      downtimeSeconds: stats.downtimeSeconds,
    },
    uptime,
    responseTime,
    statusDistribution,
    ...rankings,
  };
}
