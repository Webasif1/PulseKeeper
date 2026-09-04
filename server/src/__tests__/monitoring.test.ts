import type mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as HttpModule from '../services/channels/http.js';
import type * as HealthCheckService from '../services/healthCheck.service.js';
import type { HealthCheckOutcome } from '../services/healthCheck.service.js';

/**
 * The HTTP layer is stubbed here: this suite is about what the engine *does*
 * with a result — the incident lifecycle, the cached status, the sweep
 * counters — not about making requests. Real requests are covered in
 * healthCheck.test.ts.
 */
const runHealthCheck = vi.hoisted(() => vi.fn());

vi.mock('../services/healthCheck.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof HealthCheckService>();
  return { ...actual, runHealthCheck };
});

/** Outbound channel delivery is stubbed so nothing leaves the machine. */
const postJson = vi.hoisted(() => vi.fn());

vi.mock('../services/channels/http.js', async (importOriginal) => {
  const actual = await importOriginal<typeof HttpModule>();
  return { ...actual, postJson };
});

const { HealthCheck, Incident, MonitorRun, Notification, NotificationChannel, Settings, Site, User } =
  await import('../models/index.js');
const { checkSite, findDueSites, runMonitoringSweep } = await import(
  '../services/monitoring.service.js'
);
const { CheckSource } = await import('../types/domain.js');
const { clearTestDb, connectTestDb, disconnectTestDb } = await import('./helpers/db.js');

function onlineResult(responseTimeMs = 120): HealthCheckOutcome {
  return {
    success: true,
    status: 'ONLINE',
    statusCode: 200,
    responseTimeMs,
    redirects: 0,
  };
}

function offlineResult(): HealthCheckOutcome {
  return {
    success: false,
    status: 'OFFLINE',
    statusCode: 503,
    responseTimeMs: 90,
    errorType: 'SERVER_ERROR',
    errorMessage: 'Server returned HTTP 503',
    redirects: 0,
  };
}

let userId: mongoose.Types.ObjectId;

async function createSite(overrides: Record<string, unknown> = {}) {
  return Site.create({
    userId,
    name: 'Recallix',
    url: 'https://recallix.example.com',
    monitoringEnabled: true,
    intervalMinutes: 5,
    failureThreshold: 3,
    ...overrides,
  });
}

/** Load a site the way the engine does, as a plain object with `_id`. */
async function reload(id: mongoose.Types.ObjectId) {
  const site = await Site.findById(id).lean();
  return site as NonNullable<typeof site>;
}

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  runHealthCheck.mockReset();
  postJson.mockReset().mockResolvedValue(undefined);

  const user = await User.create({
    name: 'Asif',
    email: 'monitor@example.com',
    password: 'password123',
  });
  userId = user._id;
  await Settings.create({ userId });
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('findDueSites', () => {
  it('includes a site that has never been checked', async () => {
    await createSite();

    const due = await findDueSites();

    expect(due).toHaveLength(1);
  });

  it('excludes a site checked more recently than its interval', async () => {
    await createSite({ intervalMinutes: 5, lastCheckedAt: new Date(Date.now() - 60_000) });

    expect(await findDueSites()).toHaveLength(0);
  });

  it('includes a site whose interval has elapsed', async () => {
    await createSite({ intervalMinutes: 5, lastCheckedAt: new Date(Date.now() - 6 * 60_000) });

    expect(await findDueSites()).toHaveLength(1);
  });

  it('respects each site’s own interval', async () => {
    // One schedule serves every interval, which is why the comparison is
    // field-relative rather than a fixed cutoff.
    const twoMinutesAgo = new Date(Date.now() - 2 * 60_000);
    await createSite({ name: 'Frequent', intervalMinutes: 1, lastCheckedAt: twoMinutesAgo });
    await createSite({ name: 'Hourly', intervalMinutes: 60, lastCheckedAt: twoMinutesAgo });

    const due = await findDueSites();

    expect(due.map((site) => site.name)).toEqual(['Frequent']);
  });

  it('excludes paused sites', async () => {
    await createSite({ monitoringEnabled: false });

    expect(await findDueSites()).toHaveLength(0);
  });

  it('excludes demo sites', async () => {
    await createSite({ isDemo: true });

    // Demo hostnames live under example.com, which RFC 2606 reserves and which
    // therefore cannot resolve. Checking them would fail every time and
    // overwrite the seeded history with DNS errors within a minute of seeding.
    expect(await findDueSites()).toHaveLength(0);
  });
});

describe('checkSite', () => {
  it('records the check and updates the cached status', async () => {
    runHealthCheck.mockResolvedValue(onlineResult(150));
    const site = await createSite();

    await checkSite(await reload(site._id));

    const updated = await Site.findById(site._id);
    expect(updated).toMatchObject({
      currentStatus: 'ONLINE',
      currentResponseTime: 150,
      currentStatusCode: 200,
      consecutiveFailures: 0,
    });
    expect(updated?.lastCheckedAt).toBeInstanceOf(Date);
    expect(updated?.lastSuccessAt).toBeInstanceOf(Date);

    const checks = await HealthCheck.find({ siteId: site._id });
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ success: true, statusCode: 200, source: 'CRON' });
  });

  it('uses the health endpoint when one is set', async () => {
    runHealthCheck.mockResolvedValue(onlineResult());
    const site = await createSite({ healthEndpoint: 'https://recallix.example.com/api/health' });

    await checkSite(await reload(site._id));

    expect(runHealthCheck).toHaveBeenCalledWith(
      'https://recallix.example.com/api/health',
      expect.anything(),
    );
  });

  it('counts consecutive failures without opening an incident too early', async () => {
    runHealthCheck.mockResolvedValue(offlineResult());
    const site = await createSite({ failureThreshold: 3 });

    await checkSite(await reload(site._id));
    await checkSite(await reload(site._id));

    // Two failures against a threshold of three: down, but not an incident.
    // One dropped packet should not fill the incident list.
    expect(await Incident.countDocuments()).toBe(0);
    expect((await Site.findById(site._id))?.consecutiveFailures).toBe(2);
  });

  it('opens an incident exactly at the failure threshold', async () => {
    runHealthCheck.mockResolvedValue(offlineResult());
    const site = await createSite({ failureThreshold: 3 });

    await checkSite(await reload(site._id));
    await checkSite(await reload(site._id));
    await checkSite(await reload(site._id));

    const incidents = await Incident.find({ siteId: site._id });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({ status: 'ACTIVE', reason: 'Server returned HTTP 503' });

    const updated = await Site.findById(site._id);
    expect(updated?.activeIncidentId?.toString()).toBe(incidents[0]?.id);
  });

  it('does not open a second incident while one is open', async () => {
    runHealthCheck.mockResolvedValue(offlineResult());
    const site = await createSite({ failureThreshold: 1 });

    await checkSite(await reload(site._id));
    await checkSite(await reload(site._id));
    await checkSite(await reload(site._id));

    expect(await Incident.countDocuments({ siteId: site._id })).toBe(1);
    // The extra failures are counted against the open incident instead.
    expect((await Incident.findOne({ siteId: site._id }))?.failedChecks).toBe(3);
  });

  it('resolves the incident on recovery and records the duration', async () => {
    const site = await createSite({ failureThreshold: 1 });

    runHealthCheck.mockResolvedValue(offlineResult());
    await checkSite(await reload(site._id));

    runHealthCheck.mockResolvedValue(onlineResult());
    await checkSite(await reload(site._id));

    const incident = await Incident.findOne({ siteId: site._id });
    expect(incident).toMatchObject({ status: 'RESOLVED' });
    expect(incident?.resolvedAt).toBeInstanceOf(Date);
    expect(incident?.durationSeconds).toBeGreaterThanOrEqual(0);

    const updated = await Site.findById(site._id);
    expect(updated?.consecutiveFailures).toBe(0);
    expect(updated?.activeIncidentId ?? null).toBeNull();
  });

  it('notifies on the way down and on the way back up', async () => {
    const site = await createSite({ failureThreshold: 1 });

    runHealthCheck.mockResolvedValue(offlineResult());
    await checkSite(await reload(site._id));

    runHealthCheck.mockResolvedValue(onlineResult());
    await checkSite(await reload(site._id));

    const notifications = await Notification.find({ siteId: site._id }).sort({ createdAt: 1 });
    expect(notifications.map((entry) => entry.type)).toEqual(['SITE_DOWN', 'SITE_UP']);
  });

  it('delivers to a configured channel when a site goes down', async () => {
    await NotificationChannel.create({
      userId,
      type: 'WEBHOOK',
      name: 'Ops endpoint',
      target: 'https://ops.example.com/hook',
    });

    const site = await createSite({ failureThreshold: 1 });
    runHealthCheck.mockResolvedValue(offlineResult());

    await checkSite(await reload(site._id));

    expect(postJson).toHaveBeenCalledOnce();
    const [target, payload] = postJson.mock.calls[0] ?? [];
    expect(target).toBe('https://ops.example.com/hook');
    expect(payload).toMatchObject({ event: 'SITE_DOWN', site: { name: 'Recallix' } });
  });

  it('skips a disabled channel', async () => {
    await NotificationChannel.create({
      userId,
      type: 'WEBHOOK',
      name: 'Off',
      target: 'https://ops.example.com/hook',
      enabled: false,
    });

    const site = await createSite({ failureThreshold: 1 });
    runHealthCheck.mockResolvedValue(offlineResult());

    await checkSite(await reload(site._id));

    expect(postJson).not.toHaveBeenCalled();
  });

  it('still records the in-app notification when a channel fails', async () => {
    await NotificationChannel.create({
      userId,
      type: 'WEBHOOK',
      name: 'Broken',
      target: 'https://ops.example.com/hook',
    });
    postJson.mockRejectedValue(new Error('Endpoint returned HTTP 500'));

    const site = await createSite({ failureThreshold: 1 });
    runHealthCheck.mockResolvedValue(offlineResult());

    await checkSite(await reload(site._id));

    // A broken integration must not lose the notification, and must not fail
    // the sweep that produced it.
    expect(await Notification.countDocuments({ type: 'SITE_DOWN' })).toBe(1);
    expect((await Incident.findOne({ siteId: site._id }))?.status).toBe('ACTIVE');

    const channel = await NotificationChannel.findOne({ name: 'Broken' });
    expect(channel?.consecutiveFailures).toBe(1);
    expect(channel?.lastError).toContain('HTTP 500');
  });

  it('respects a user who turned recovery notifications off', async () => {
    await Settings.updateOne({ userId }, { $set: { 'notifications.onUp': false } });
    const site = await createSite({ failureThreshold: 1 });

    runHealthCheck.mockResolvedValue(offlineResult());
    await checkSite(await reload(site._id));
    runHealthCheck.mockResolvedValue(onlineResult());
    await checkSite(await reload(site._id));

    const types = (await Notification.find({ siteId: site._id })).map((entry) => entry.type);
    expect(types).toEqual(['SITE_DOWN']);
    // The incident still resolves; only the notification is suppressed.
    expect((await Incident.findOne({ siteId: site._id }))?.status).toBe('RESOLVED');
  });

  it('computes uptime from history, not from the current status', async () => {
    const site = await createSite();

    runHealthCheck.mockResolvedValue(offlineResult());
    await checkSite(await reload(site._id));

    runHealthCheck.mockResolvedValue(onlineResult());
    await checkSite(await reload(site._id));
    await checkSite(await reload(site._id));
    await checkSite(await reload(site._id));

    // Three successes out of four checks. A site that is up right now is not
    // therefore at 100%.
    expect((await Site.findById(site._id))?.uptimePercentage).toBe(75);
  });

  it('contains a thrown check instead of letting it escape', async () => {
    runHealthCheck.mockRejectedValue(new Error('something broke badly'));
    const site = await createSite();

    const result = await checkSite(await reload(site._id));

    expect(result.threw).toBe(true);
    // lastCheckedAt still moves, so a permanently broken site cannot monopolise
    // every future sweep.
    expect((await Site.findById(site._id))?.lastCheckedAt).toBeInstanceOf(Date);
  });
});

describe('runMonitoringSweep', () => {
  it('checks every due site and summarises the outcome', async () => {
    await createSite({ name: 'Up' });
    await createSite({ name: 'Down' });

    runHealthCheck
      .mockResolvedValueOnce(onlineResult())
      .mockResolvedValueOnce(offlineResult());

    const summary = await runMonitoringSweep();

    expect(summary).toMatchObject({ checked: 2, online: 1, offline: 1, errors: 0 });
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('keeps going when one site throws', async () => {
    await createSite({ name: 'Broken' });
    await createSite({ name: 'Fine' });

    runHealthCheck
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(onlineResult());

    const summary = await runMonitoringSweep();

    // SPEC section 43: one failing site must never abort the run.
    expect(summary.checked).toBe(2);
    expect(summary.errors).toBe(1);
    expect(summary.online).toBe(1);
  });

  it('records the run so the monitoring log survives a restart', async () => {
    await createSite();
    runHealthCheck.mockResolvedValue(onlineResult());

    await runMonitoringSweep();

    const run = await MonitorRun.findOne().sort({ startedAt: -1 });
    expect(run).toMatchObject({ checked: 1, online: 1, trigger: 'CRON' });
    expect(run?.finishedAt).toBeInstanceOf(Date);
  });

  it('does not record a row for an idle cron tick', async () => {
    const summary = await runMonitoringSweep();

    // The scheduler fires every minute and most ticks find nothing due.
    // Recording them would add ~1,400 empty rows a day and bury the runs that
    // actually checked something.
    expect(summary.checked).toBe(0);
    expect(await MonitorRun.countDocuments()).toBe(0);
  });

  it('records an idle run when a person triggered it', async () => {
    const summary = await runMonitoringSweep(CheckSource.EXTERNAL);

    // Whoever pressed the button is entitled to see that it ran, even if
    // nothing was due.
    expect(summary.checked).toBe(0);
    expect(await MonitorRun.countDocuments()).toBe(1);
  });

  it('counts incidents opened and resolved during the sweep', async () => {
    const site = await createSite({ failureThreshold: 1 });

    runHealthCheck.mockResolvedValue(offlineResult());
    const down = await runMonitoringSweep();
    expect(down.incidentsOpened).toBe(1);

    await Site.updateOne({ _id: site._id }, { $set: { lastCheckedAt: new Date(0) } });

    runHealthCheck.mockResolvedValue(onlineResult());
    const up = await runMonitoringSweep();
    expect(up.incidentsResolved).toBe(1);
  });
});
