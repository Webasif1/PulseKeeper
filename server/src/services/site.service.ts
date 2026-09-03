import type { FilterQuery, SortOrder, Types } from 'mongoose';

import { HealthCheck, Incident, Notification, Settings, Site, type ISite } from '../models/index.js';
import { SiteStatus, type SiteStatusValue } from '../types/domain.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import { assertUrlAllowed } from '../utils/urlGuard.js';
import type { CreateSiteInput, ListSitesQuery, UpdateSiteInput } from '../validators/site.validators.js';

const log = createLogger('sites');

/** A site document as it comes back from either `.lean()` or `.toObject()`. */
type RawSite = ISite & { _id: Types.ObjectId };

/** The site shape the API returns. */
export interface PublicSite {
  id: string;
  name: string;
  url: string;
  healthEndpoint?: string;
  /** The URL the monitor actually requests: `healthEndpoint` or `url`. */
  checkUrl: string;
  description?: string;
  tags: string[];

  monitoringEnabled: boolean;
  intervalMinutes: number;
  timeoutSeconds: number;
  slowThresholdMs: number;
  failureThreshold: number;

  currentStatus: SiteStatusValue;
  currentResponseTime?: number;
  currentStatusCode?: number;
  lastCheckedAt?: Date;
  lastSuccessAt?: Date;
  consecutiveFailures: number;
  uptimePercentage: number;
  activeIncidentId?: string;

  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Serialise a site for the API.
 *
 * Every read path goes through this, so a site has exactly one shape whether it
 * was loaded with `.lean()` (which drops virtuals) or as a hydrated document
 * (which adds `_id`, `__v`, and a duplicate `id`). It also keeps `userId` out of
 * responses: the caller already knows who they are, and echoing it invites
 * clients to start passing it back.
 */
export function toPublicSite(site: RawSite): PublicSite {
  return {
    id: site._id.toString(),
    name: site.name,
    url: site.url,
    ...(site.healthEndpoint ? { healthEndpoint: site.healthEndpoint } : {}),
    checkUrl: site.healthEndpoint?.trim() || site.url,
    ...(site.description ? { description: site.description } : {}),
    tags: site.tags ?? [],

    monitoringEnabled: site.monitoringEnabled,
    intervalMinutes: site.intervalMinutes,
    timeoutSeconds: site.timeoutSeconds,
    slowThresholdMs: site.slowThresholdMs,
    failureThreshold: site.failureThreshold,

    currentStatus: site.currentStatus,
    ...(site.currentResponseTime !== undefined
      ? { currentResponseTime: site.currentResponseTime }
      : {}),
    ...(site.currentStatusCode !== undefined
      ? { currentStatusCode: site.currentStatusCode }
      : {}),
    ...(site.lastCheckedAt ? { lastCheckedAt: site.lastCheckedAt } : {}),
    ...(site.lastSuccessAt ? { lastSuccessAt: site.lastSuccessAt } : {}),
    consecutiveFailures: site.consecutiveFailures,
    uptimePercentage: site.uptimePercentage,
    ...(site.activeIncidentId ? { activeIncidentId: site.activeIncidentId.toString() } : {}),

    isDemo: site.isDemo,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  };
}

/** Escape user input before it is used inside a regular expression. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Map the API's sort names onto document fields. */
const SORT_FIELDS: Record<ListSitesQuery['sort'], string> = {
  name: 'name',
  status: 'currentStatus',
  responseTime: 'currentResponseTime',
  uptime: 'uptimePercentage',
  lastChecked: 'lastCheckedAt',
  createdAt: 'createdAt',
};

export interface ListSitesResult {
  items: PublicSite[];
  total: number;
}

/**
 * List one user's sites.
 *
 * Every query in this module filters on `userId`. That is the tenant boundary
 * (SPEC section 27): a site id alone must never be enough to reach a document.
 */
export async function listSites(
  userId: string,
  query: ListSitesQuery,
): Promise<ListSitesResult> {
  const filter: FilterQuery<ISite> = { userId };

  if (query.status) {
    filter.currentStatus = query.status;
  }

  if (query.tag) {
    filter.tags = query.tag;
  }

  if (query.search) {
    // Regex rather than the text index: users search for fragments of a URL or
    // a partial name, which tokenised text search handles poorly.
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: pattern }, { url: pattern }, { tags: pattern }];
  }

  const sortField = SORT_FIELDS[query.sort];
  const direction: SortOrder = query.order === 'asc' ? 1 : -1;

  const [items, total] = await Promise.all([
    Site.find(filter)
      .sort({ [sortField]: direction, _id: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Site.countDocuments(filter),
  ]);

  return { items: (items as RawSite[]).map(toPublicSite), total };
}

export async function getSiteById(userId: string, siteId: string): Promise<PublicSite> {
  const site = await Site.findOne({ _id: siteId, userId }).lean();

  if (!site) {
    // Deliberately the same 404 a genuinely missing site produces, so the
    // endpoint cannot be used to discover which ids exist.
    throw AppError.notFound('Site not found');
  }

  return toPublicSite(site as RawSite);
}

/**
 * Validate a site's URLs against the SSRF guard, including DNS resolution.
 *
 * Runs on create and on any edit that touches a URL. The same check runs again
 * at check time, because a name that resolves publicly today can resolve to
 * loopback tomorrow.
 */
async function assertSiteUrlsAllowed(input: {
  url?: string;
  healthEndpoint?: string;
}): Promise<void> {
  if (input.url) await assertUrlAllowed(input.url);
  if (input.healthEndpoint) await assertUrlAllowed(input.healthEndpoint);
}

export async function createSite(userId: string, input: CreateSiteInput): Promise<PublicSite> {
  await assertSiteUrlsAllowed(input);

  // Unspecified monitoring fields inherit the user's defaults, then belong to
  // the site: changing a default later never silently alters existing sites.
  const settings = await Settings.findOne({ userId }).lean();

  const site = await Site.create({
    userId,
    name: input.name,
    url: input.url,
    healthEndpoint: input.healthEndpoint,
    description: input.description,
    tags: input.tags ?? [],
    monitoringEnabled: input.monitoringEnabled ?? true,
    intervalMinutes: input.intervalMinutes ?? settings?.defaultIntervalMinutes,
    timeoutSeconds: input.timeoutSeconds ?? settings?.defaultTimeoutSeconds,
    slowThresholdMs: input.slowThresholdMs ?? settings?.defaultSlowThresholdMs,
    failureThreshold: input.failureThreshold ?? settings?.defaultFailureThreshold,
    currentStatus:
      (input.monitoringEnabled ?? true) ? SiteStatus.UNKNOWN : SiteStatus.PAUSED,
  });

  log.info({ userId, siteId: site.id }, 'Site created');

  return toPublicSite(site.toObject() as RawSite);
}

export async function updateSite(
  userId: string,
  siteId: string,
  input: UpdateSiteInput,
): Promise<PublicSite> {
  const site = await Site.findOne({ _id: siteId, userId });
  if (!site) {
    throw AppError.notFound('Site not found');
  }

  // Only revalidate URLs that actually changed: DNS lookups are not free, and
  // an unrelated edit should not fail because a resolver is briefly unhappy.
  await assertSiteUrlsAllowed({
    url: input.url && input.url !== site.url ? input.url : undefined,
    healthEndpoint:
      input.healthEndpoint && input.healthEndpoint !== site.healthEndpoint
        ? input.healthEndpoint
        : undefined,
  });

  Object.assign(site, input);

  // Pausing and resuming move the cached status, which is otherwise written
  // only by the monitoring engine.
  if (input.monitoringEnabled === false) {
    site.currentStatus = SiteStatus.PAUSED;
  } else if (input.monitoringEnabled === true && site.currentStatus === SiteStatus.PAUSED) {
    site.currentStatus = SiteStatus.UNKNOWN;
  }

  await site.save();

  log.info({ userId, siteId }, 'Site updated');

  return toPublicSite(site.toObject() as RawSite);
}

/**
 * Delete a site and everything that belongs to it.
 *
 * Without the cascade, health checks and incidents would outlive their site and
 * skew every aggregate that counts them.
 */
export async function deleteSite(userId: string, siteId: string): Promise<void> {
  const site = await Site.findOneAndDelete({ _id: siteId, userId });

  if (!site) {
    throw AppError.notFound('Site not found');
  }

  const [checks, incidents, notifications] = await Promise.all([
    HealthCheck.deleteMany({ siteId }),
    Incident.deleteMany({ siteId }),
    Notification.deleteMany({ siteId }),
  ]);

  log.info(
    {
      userId,
      siteId,
      deletedChecks: checks.deletedCount,
      deletedIncidents: incidents.deletedCount,
      deletedNotifications: notifications.deletedCount,
    },
    'Site deleted',
  );
}
