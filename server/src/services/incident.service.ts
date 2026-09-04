import type { Types } from 'mongoose';

import { Incident, type IncidentDocument, type ISite } from '../models/index.js';
import { IncidentStatus, NotificationType, type CheckErrorTypeValue } from '../types/domain.js';
import { createLogger } from '../utils/logger.js';
import { notify } from './notification.service.js';

const log = createLogger('incidents');

export interface IncidentTransition {
  opened: boolean;
  resolved: boolean;
  incidentId?: string;
}

type SiteWithId = ISite & { _id: Types.ObjectId };

/**
 * Open an incident, tolerating a concurrent opener.
 *
 * The partial unique index permits one active incident per site, so a manual
 * check racing the cron sweep produces a duplicate-key error rather than a
 * second incident. That is the desired outcome: catch it and use the incident
 * the other writer created.
 */
async function openIncident(
  site: SiteWithId,
  reason: string,
  errorType?: CheckErrorTypeValue,
  statusCode?: number,
): Promise<IncidentDocument | null> {
  try {
    return await Incident.create({
      siteId: site._id,
      userId: site.userId,
      status: IncidentStatus.ACTIVE,
      reason,
      errorType,
      statusCode,
      startedAt: new Date(),
      failedChecks: site.consecutiveFailures,
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      log.debug({ siteId: site._id.toString() }, 'Incident already open, reusing it');
      return Incident.findOne({ siteId: site._id, status: IncidentStatus.ACTIVE });
    }
    throw error;
  }
}

/**
 * Record a failed check.
 *
 * An incident opens only once the site has failed `failureThreshold` times in a
 * row (SPEC section 16). A single failed request is noise — a dropped packet, a
 * brief restart — and creating an incident for each one would make the incident
 * list useless.
 *
 * `consecutiveFailures` is incremented by the caller before this runs.
 */
export async function handleFailedCheck(
  site: SiteWithId,
  reason: string,
  errorType?: CheckErrorTypeValue,
  statusCode?: number,
): Promise<IncidentTransition> {
  const belowThreshold = site.consecutiveFailures < site.failureThreshold;

  if (belowThreshold) {
    return { opened: false, resolved: false };
  }

  const existing = await Incident.findOne({ siteId: site._id, status: IncidentStatus.ACTIVE });

  if (existing) {
    // Already down; count the failure against the open incident rather than
    // opening another.
    existing.failedChecks += 1;
    await existing.save();
    return { opened: false, resolved: false, incidentId: existing.id as string };
  }

  const incident = await openIncident(site, reason, errorType, statusCode);
  if (!incident) {
    return { opened: false, resolved: false };
  }

  log.warn(
    { siteId: site._id.toString(), incidentId: incident.id, reason },
    'Incident opened',
  );

  await notify({
    userId: site.userId.toString(),
    siteId: site._id.toString(),
    siteName: site.name,
    siteUrl: site.url,
    incidentId: incident.id as string,
    type: NotificationType.SITE_DOWN,
    title: `${site.name} is down`,
    message: reason,
  });

  return { opened: true, resolved: false, incidentId: incident.id as string };
}

/**
 * Record a successful check, resolving any open incident.
 *
 * Recovery is immediate: one success closes the incident. Requiring several
 * would inflate reported downtime, and the health timeline already shows a
 * flapping site for what it is.
 */
export async function handleSuccessfulCheck(site: SiteWithId): Promise<IncidentTransition> {
  const incident = await Incident.findOne({ siteId: site._id, status: IncidentStatus.ACTIVE });

  if (!incident) {
    return { opened: false, resolved: false };
  }

  const resolvedAt = new Date();
  incident.status = IncidentStatus.RESOLVED;
  incident.resolvedAt = resolvedAt;
  incident.durationSeconds = Math.max(
    0,
    Math.round((resolvedAt.getTime() - incident.startedAt.getTime()) / 1000),
  );
  await incident.save();

  log.info(
    {
      siteId: site._id.toString(),
      incidentId: incident.id,
      durationSeconds: incident.durationSeconds,
    },
    'Incident resolved',
  );

  await notify({
    userId: site.userId.toString(),
    siteId: site._id.toString(),
    siteName: site.name,
    siteUrl: site.url,
    incidentId: incident.id as string,
    type: NotificationType.SITE_UP,
    title: `${site.name} is back online`,
    message: `Recovered after ${formatDuration(incident.durationSeconds)}`,
  });

  return { opened: false, resolved: true, incidentId: incident.id as string };
}

/** Human-readable duration for notification copy. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours} hour${hours === 1 ? '' : 's'}`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}
