/**
 * Demo data (SPEC section 39).
 *
 * Generates a signed-in-able account with five sites and a month of plausible
 * history, so the dashboard, charts, incidents, and analytics can all be seen
 * working without waiting a month for real data to accumulate.
 *
 * Everything it writes is flagged `isDemo: true`, and the sites use
 * `.example.com` hostnames, which RFC 2606 reserves for documentation and which
 * therefore cannot resolve to anyone's real service. Demo data is never
 * mistakable for real monitoring.
 *
 *   npm run seed              seed the default demo account
 *   npm run seed -- --clean   remove demo data and stop
 */
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { MONITORING_DEFAULTS } from '../constants/monitoring.js';
import {
  HealthCheck,
  Incident,
  Notification,
  Settings,
  Site,
  User,
  type IHealthCheck,
} from '../models/index.js';
import {
  CheckErrorType,
  CheckSource,
  IncidentStatus,
  NotificationType,
  SiteStatus,
} from '../types/domain.js';
import { logger } from '../utils/logger.js';

const DEMO_EMAIL = 'demo@pulsekeeper.dev';
const DEMO_PASSWORD = 'pulsekeeper-demo';

/** History depth and sampling. 15-minute spacing over 30 days is ~2,880 checks
 *  per site: enough for every chart range to have shape, small enough to seed
 *  in a few seconds. */
const HISTORY_DAYS = 30;
const CHECK_INTERVAL_MINUTES = 15;

interface DemoSiteSpec {
  name: string;
  url: string;
  healthEndpoint?: string;
  description: string;
  tags: string[];
  /** Typical response time in ms; each check varies around it. */
  baseResponseMs: number;
  /** Probability of an isolated failed check outside an outage. */
  failureRate: number;
  /** Outages over the seeded period. */
  outages: number;
  slowThresholdMs: number;
  monitoringEnabled?: boolean;
  /**
   * The state the site should be left in.
   *
   * Chosen rather than left to chance: a demo whose sites happen to all be
   * green shows nothing, and the dashboard is meant to display a mix of
   * statuses and at least one ongoing incident.
   */
  finalState?: 'ONLINE' | 'SLOW' | 'OFFLINE';
}

const DEMO_SITES: DemoSiteSpec[] = [
  {
    name: 'Recallix',
    url: 'https://recallix.example.com',
    healthEndpoint: 'https://recallix.example.com/api/health',
    description: 'Spaced-repetition study app',
    tags: ['react', 'render'],
    baseResponseMs: 320,
    failureRate: 0.002,
    outages: 2,
    slowThresholdMs: 3000,
  },
  {
    name: 'Movie Spark',
    url: 'https://moviespark.example.com',
    description: 'Movie discovery and watchlist',
    tags: ['react', 'tmdb'],
    baseResponseMs: 780,
    // The unreliable one, so incidents and the failing-sites ranking have
    // something real to show.
    failureRate: 0.01,
    outages: 7,
    slowThresholdMs: 2000,
    // Left down, so the dashboard has an active incident to show.
    finalState: 'OFFLINE',
  },
  {
    name: 'Portfolio',
    url: 'https://portfolio.example.com',
    description: 'Personal portfolio site',
    tags: ['static', 'vercel'],
    baseResponseMs: 95,
    failureRate: 0.0003,
    outages: 1,
    slowThresholdMs: 1500,
  },
  {
    name: 'API Server',
    url: 'https://api.example.com',
    healthEndpoint: 'https://api.example.com/healthz',
    description: 'Shared backend for side projects',
    tags: ['express', 'railway'],
    // Slow enough to sit near its threshold, so the SLOW status appears.
    baseResponseMs: 1650,
    failureRate: 0.004,
    outages: 3,
    slowThresholdMs: 1800,
    finalState: 'SLOW',
  },
  {
    name: 'Korean Hive',
    url: 'https://koreanhive.example.com',
    description: 'Korean vocabulary trainer — paused while rebuilding',
    tags: ['nextjs'],
    baseResponseMs: 410,
    failureRate: 0.001,
    outages: 1,
    slowThresholdMs: 3000,
    monitoringEnabled: false,
  },
];

/** Deterministic pseudo-random source, so reseeding produces the same shape. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

/** A response time around the site's baseline, with a daily traffic curve and
 *  the occasional spike, so charts look like real traffic rather than noise. */
function responseTimeFor(spec: DemoSiteSpec, at: Date, random: () => number): number {
  const hour = at.getUTCHours();
  // Busier in the afternoon, quieter overnight.
  const daily = 1 + 0.35 * Math.sin(((hour - 6) / 24) * 2 * Math.PI);
  const jitter = 0.8 + random() * 0.4;
  const spike = random() < 0.02 ? 1.8 + random() : 1;

  return Math.max(20, Math.round(spec.baseResponseMs * daily * jitter * spike));
}

async function removeDemoData(): Promise<void> {
  const demoUser = await User.findOne({ email: DEMO_EMAIL });

  if (demoUser) {
    await Promise.all([
      Site.deleteMany({ userId: demoUser._id }),
      HealthCheck.deleteMany({ userId: demoUser._id }),
      Incident.deleteMany({ userId: demoUser._id }),
      Notification.deleteMany({ userId: demoUser._id }),
    ]);
  }

  // Anything marked demo, wherever it came from.
  await Promise.all([
    Site.deleteMany({ isDemo: true }),
    HealthCheck.deleteMany({ isDemo: true }),
  ]);
}

async function seed(): Promise<void> {
  await removeDemoData();

  let user = await User.findOne({ email: DEMO_EMAIL });

  if (!user) {
    user = await User.create({
      name: 'Demo Developer',
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    logger.info({ email: DEMO_EMAIL }, 'Created demo account');
  }

  await Settings.findOneAndUpdate(
    { userId: user._id },
    { $setOnInsert: { userId: user._id } },
    { upsert: true, setDefaultsOnInsert: true },
  );

  const now = new Date();
  const totalChecks = (HISTORY_DAYS * 24 * 60) / CHECK_INTERVAL_MINUTES;

  for (const [index, spec] of DEMO_SITES.entries()) {
    const random = makeRandom(index * 7919 + 13);

    const site = await Site.create({
      userId: user._id,
      name: spec.name,
      url: spec.url,
      healthEndpoint: spec.healthEndpoint,
      description: spec.description,
      tags: spec.tags,
      monitoringEnabled: spec.monitoringEnabled ?? true,
      intervalMinutes: MONITORING_DEFAULTS.intervalMinutes,
      timeoutSeconds: MONITORING_DEFAULTS.timeoutSeconds,
      slowThresholdMs: spec.slowThresholdMs,
      failureThreshold: MONITORING_DEFAULTS.failureThreshold,
      isDemo: true,
    });

    const checks: Array<Partial<IHealthCheck>> = [];
    const incidents: Array<{ startedAt: Date; resolvedAt: Date; failedChecks: number }> = [];

    /**
     * Outage windows.
     *
     * Failures have to be clustered, not independent. With independent draws at
     * a realistic failure rate, three consecutive failures — the threshold an
     * incident needs — essentially never occurs, and the first version of this
     * script duly produced a demo with zero incidents. Real outages last for a
     * stretch, so they are modelled as spans of consecutive failed checks.
     */
    const outageWindows: Array<{ start: number; length: number }> = [];
    for (let outage = 0; outage < spec.outages; outage += 1) {
      outageWindows.push({
        // 3 to 10 checks: long enough to cross the failure threshold, short
        // enough to look like an outage rather than an abandoned service.
        start: Math.floor(random() * (totalChecks - 12)) + 6,
        length: 3 + Math.floor(random() * 8),
      });
    }

    const isInOutage = (step: number): boolean =>
      outageWindows.some((window) => step <= window.start && step > window.start - window.length);

    let consecutiveFailures = 0;
    let outageStart: Date | null = null;
    let lastCheck: { success: boolean; responseTimeMs?: number; statusCode?: number } = {
      success: true,
    };

    for (let step = totalChecks; step >= 0; step -= 1) {
      const checkedAt = new Date(now.getTime() - step * CHECK_INTERVAL_MINUTES * 60 * 1000);
      const failed = isInOutage(step) || random() < spec.failureRate;

      if (failed) {
        consecutiveFailures += 1;
        if (consecutiveFailures === MONITORING_DEFAULTS.failureThreshold) {
          outageStart = checkedAt;
        }

        checks.push({
          siteId: site._id,
          userId: user._id,
          checkedAt,
          success: false,
          statusCode: 503,
          errorType: CheckErrorType.SERVER_ERROR,
          errorMessage: 'Server returned HTTP 503',
          source: CheckSource.SEED,
          isDemo: true,
        });

        lastCheck = { success: false, statusCode: 503 };
      } else {
        if (outageStart) {
          incidents.push({
            startedAt: outageStart,
            resolvedAt: checkedAt,
            failedChecks: consecutiveFailures,
          });
          outageStart = null;
        }
        consecutiveFailures = 0;

        const responseTimeMs = responseTimeFor(spec, checkedAt, random);

        checks.push({
          siteId: site._id,
          userId: user._id,
          checkedAt,
          success: true,
          statusCode: 200,
          responseTimeMs,
          source: CheckSource.SEED,
          isDemo: true,
        });

        lastCheck = { success: true, responseTimeMs, statusCode: 200 };
      }
    }

    /**
     * Put the site into its intended final state.
     *
     * The generated history is random, so without this every site would end
     * however chance left it — usually all green, which demonstrates nothing.
     * The tail is rewritten instead, and any incident it implies is created
     * below alongside the historical ones.
     */
    let activeIncidentStart: Date | null = null;

    if (spec.finalState === 'OFFLINE') {
      const failing = checks.slice(-MONITORING_DEFAULTS.failureThreshold);
      activeIncidentStart = failing[0]?.checkedAt ?? now;

      for (const check of failing) {
        check.success = false;
        check.statusCode = 503;
        check.errorType = CheckErrorType.SERVER_ERROR;
        check.errorMessage = 'Server returned HTTP 503';
        delete check.responseTimeMs;
      }

      consecutiveFailures = MONITORING_DEFAULTS.failureThreshold;
      lastCheck = { success: false, statusCode: 503 };
    } else if (spec.finalState === 'SLOW') {
      const slowResponse = Math.round(spec.slowThresholdMs * 1.3);
      const finalCheck = checks.at(-1);

      if (finalCheck) {
        finalCheck.success = true;
        finalCheck.statusCode = 200;
        finalCheck.responseTimeMs = slowResponse;
        delete finalCheck.errorType;
        delete finalCheck.errorMessage;
      }

      consecutiveFailures = 0;
      lastCheck = { success: true, responseTimeMs: slowResponse, statusCode: 200 };
    }

    // Batched: one insert of ~2,900 documents is far cheaper than 2,900 inserts.
    await HealthCheck.insertMany(checks, { ordered: false });

    for (const incident of incidents) {
      await Incident.create({
        siteId: site._id,
        userId: user._id,
        status: IncidentStatus.RESOLVED,
        reason: 'Server returned HTTP 503',
        errorType: CheckErrorType.SERVER_ERROR,
        statusCode: 503,
        startedAt: incident.startedAt,
        resolvedAt: incident.resolvedAt,
        durationSeconds: Math.round(
          (incident.resolvedAt.getTime() - incident.startedAt.getTime()) / 1000,
        ),
        failedChecks: incident.failedChecks,
      });
    }

    if (activeIncidentStart) {
      await Incident.create({
        siteId: site._id,
        userId: user._id,
        status: IncidentStatus.ACTIVE,
        reason: 'Server returned HTTP 503',
        errorType: CheckErrorType.SERVER_ERROR,
        statusCode: 503,
        startedAt: activeIncidentStart,
        failedChecks: MONITORING_DEFAULTS.failureThreshold,
      });

      await Notification.create({
        userId: user._id,
        siteId: site._id,
        type: NotificationType.SITE_DOWN,
        title: `${spec.name} is down`,
        message: 'Server returned HTTP 503',
        read: false,
        createdAt: activeIncidentStart,
      });
    }

    const successful = checks.filter((check) => check.success).length;
    const uptime = Math.round((successful / checks.length) * 10_000) / 100;

    const status = spec.monitoringEnabled === false
      ? SiteStatus.PAUSED
      : lastCheck.success
        ? (lastCheck.responseTimeMs ?? 0) > spec.slowThresholdMs
          ? SiteStatus.SLOW
          : SiteStatus.ONLINE
        : SiteStatus.OFFLINE;

    await Site.updateOne(
      { _id: site._id },
      {
        $set: {
          currentStatus: status,
          currentResponseTime: lastCheck.responseTimeMs ?? null,
          currentStatusCode: lastCheck.statusCode ?? null,
          lastCheckedAt: now,
          lastSuccessAt: lastCheck.success ? now : undefined,
          consecutiveFailures,
          uptimePercentage: uptime,
        },
      },
    );

    // A couple of notifications from the most recent incident, so the bell is
    // not empty on a fresh demo.
    const latestIncident = incidents.at(-1);
    if (latestIncident) {
      await Notification.create([
        {
          userId: user._id,
          siteId: site._id,
          type: NotificationType.SITE_DOWN,
          title: `${spec.name} is down`,
          message: 'Server returned HTTP 503',
          read: true,
          createdAt: latestIncident.startedAt,
        },
        {
          userId: user._id,
          siteId: site._id,
          type: NotificationType.SITE_UP,
          title: `${spec.name} is back online`,
          message: 'Recovered',
          read: false,
          createdAt: latestIncident.resolvedAt,
        },
      ]);
    }

    logger.info(
      { site: spec.name, checks: checks.length, incidents: incidents.length, uptime },
      'Seeded demo site',
    );
  }
}

async function main(): Promise<void> {
  const cleanOnly = process.argv.includes('--clean');

  await connectDatabase();

  try {
    if (cleanOnly) {
      await removeDemoData();
      logger.info('Demo data removed');
    } else {
      await seed();
      logger.info(
        { email: DEMO_EMAIL, password: DEMO_PASSWORD },
        'Demo data ready — sign in with these credentials',
      );
    }
  } finally {
    await disconnectDatabase();
    await mongoose.connection.close();
  }
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Seeding failed');
  process.exit(1);
});
