import type mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { HealthCheck, Incident, Settings, Site, User } from '../models/index.js';
import {
  calculateUptimeWindows,
  getResponseTimeSeries,
  getSiteStats,
} from '../services/analytics.service.js';
import { clearTestDb, connectTestDb, disconnectTestDb } from './helpers/db.js';
import { stubDnsPublic } from './helpers/dns.js';

const app = createApp();

let userId: mongoose.Types.ObjectId;
let siteId: mongoose.Types.ObjectId;

const NOW = new Date('2026-09-03T12:00:00.000Z');

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000);
}

function daysAgo(days: number): Date {
  return hoursAgo(days * 24);
}

async function seedCheck(options: {
  at: Date;
  success: boolean;
  responseTimeMs?: number;
  statusCode?: number;
}) {
  await HealthCheck.create({
    siteId,
    userId,
    checkedAt: options.at,
    success: options.success,
    statusCode: options.statusCode ?? (options.success ? 200 : 503),
    responseTimeMs: options.responseTimeMs,
    ...(options.success ? {} : { errorType: 'SERVER_ERROR' }),
  });
}

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  stubDnsPublic();

  const user = await User.create({
    name: 'Asif',
    email: 'analytics@example.com',
    password: 'password123',
  });
  userId = user._id;
  await Settings.create({ userId });

  const site = await Site.create({
    userId,
    name: 'Recallix',
    url: 'https://recallix.example.com',
  });
  siteId = site._id;
});

afterAll(async () => {
  vi.restoreAllMocks();
  await disconnectTestDb();
});

describe('calculateUptimeWindows', () => {
  it('computes each window from that window’s checks alone', async () => {
    // Perfect in the last day, poor a week ago. A single global figure would
    // hide both facts.
    await seedCheck({ at: hoursAgo(1), success: true, responseTimeMs: 100 });
    await seedCheck({ at: hoursAgo(2), success: true, responseTimeMs: 100 });
    await seedCheck({ at: daysAgo(5), success: false });
    await seedCheck({ at: daysAgo(5), success: false });

    const uptime = await calculateUptimeWindows({ siteId }, NOW);

    expect(uptime['24h']).toBe(100);
    expect(uptime['7d']).toBe(50);
    expect(uptime['30d']).toBe(50);
  });

  it('reports zero when a window holds no checks', async () => {
    const uptime = await calculateUptimeWindows({ siteId }, NOW);

    expect(uptime).toEqual({ '24h': 0, '7d': 0, '30d': 0, '90d': 0 });
  });

  it('does not count checks older than the widest window', async () => {
    await seedCheck({ at: daysAgo(120), success: false });
    await seedCheck({ at: hoursAgo(1), success: true, responseTimeMs: 100 });

    const uptime = await calculateUptimeWindows({ siteId }, NOW);

    expect(uptime['90d']).toBe(100);
  });

  it('rounds to two decimals', async () => {
    // Two failures in seven checks: 71.4285…%
    for (let index = 0; index < 5; index += 1) {
      await seedCheck({ at: hoursAgo(index + 1), success: true, responseTimeMs: 100 });
    }
    await seedCheck({ at: hoursAgo(6), success: false });
    await seedCheck({ at: hoursAgo(7), success: false });

    const uptime = await calculateUptimeWindows({ siteId }, NOW);

    expect(uptime['24h']).toBe(71.43);
  });
});

describe('getSiteStats', () => {
  it('averages response time over successful checks only', async () => {
    await seedCheck({ at: hoursAgo(1), success: true, responseTimeMs: 100 });
    await seedCheck({ at: hoursAgo(2), success: true, responseTimeMs: 300 });
    // A failure has no duration; counting it as zero would drag the average
    // down and hide real slowness.
    await seedCheck({ at: hoursAgo(3), success: false });

    const stats = await getSiteStats({ siteId }, '24h', NOW);

    expect(stats.avgResponseTime).toBe(200);
    expect(stats.minResponseTime).toBe(100);
    expect(stats.maxResponseTime).toBe(300);
    expect(stats.totalChecks).toBe(3);
    expect(stats.failedChecks).toBe(1);
    expect(stats.uptimePercentage).toBe(66.67);
  });

  it('returns nulls rather than zeros when there is nothing to average', async () => {
    const stats = await getSiteStats({ siteId }, '24h', NOW);

    // null means "no data"; 0 would read as "instant", which is a different
    // and wrong claim.
    expect(stats.avgResponseTime).toBeNull();
    expect(stats.minResponseTime).toBeNull();
    expect(stats.totalChecks).toBe(0);
  });

  it('counts downtime from incidents, clipped to the window', async () => {
    // Started well before the window; only the part inside it counts.
    await Incident.create({
      siteId,
      userId,
      status: 'RESOLVED',
      reason: 'HTTP 503',
      startedAt: hoursAgo(30),
      resolvedAt: hoursAgo(23),
      durationSeconds: 7 * 3600,
    });

    const stats = await getSiteStats({ siteId }, '24h', NOW);

    // 24h window opens at hoursAgo(24); the incident ran on to hoursAgo(23).
    expect(stats.downtimeSeconds).toBe(3600);
  });

  it('counts an unresolved incident up to now', async () => {
    await Incident.create({
      siteId,
      userId,
      status: 'ACTIVE',
      reason: 'HTTP 503',
      startedAt: hoursAgo(2),
    });

    const stats = await getSiteStats({ siteId }, '24h', NOW);

    expect(stats.downtimeSeconds).toBeGreaterThan(7000);
  });
});

describe('getResponseTimeSeries', () => {
  it('buckets checks and reports avg, min, and max per bucket', async () => {
    const bucketTime = hoursAgo(2);
    await seedCheck({ at: bucketTime, success: true, responseTimeMs: 100 });
    await seedCheck({ at: new Date(bucketTime.getTime() + 60_000), success: true, responseTimeMs: 300 });

    const series = await getResponseTimeSeries({ siteId }, '24h', NOW);

    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({ avg: 200, min: 100, max: 300, count: 2 });
  });

  it('excludes failed checks from the series', async () => {
    await seedCheck({ at: hoursAgo(1), success: true, responseTimeMs: 200 });
    await seedCheck({ at: hoursAgo(1), success: false });

    const series = await getResponseTimeSeries({ siteId }, '24h', NOW);

    expect(series[0]?.count).toBe(1);
    expect(series[0]?.avg).toBe(200);
  });

  it('downsamples rather than returning every check', async () => {
    // 90 checks a few minutes apart. At 30-minute buckets the 24h range must
    // return far fewer points than checks — the whole purpose of bucketing.
    for (let index = 0; index < 90; index += 1) {
      await seedCheck({
        at: new Date(NOW.getTime() - index * 5 * 60 * 1000),
        success: true,
        responseTimeMs: 100 + index,
      });
    }

    const series = await getResponseTimeSeries({ siteId }, '24h', NOW);

    expect(series.length).toBeLessThan(20);
    expect(series.length).toBeGreaterThan(0);
  });

  it('returns points in chronological order', async () => {
    await seedCheck({ at: hoursAgo(1), success: true, responseTimeMs: 100 });
    await seedCheck({ at: hoursAgo(5), success: true, responseTimeMs: 200 });
    await seedCheck({ at: hoursAgo(3), success: true, responseTimeMs: 300 });

    const series = await getResponseTimeSeries({ siteId }, '24h', NOW);

    const timestamps = series.map((point) => point.timestamp.getTime());
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
  });
});

describe('analytics endpoints', () => {
  async function signIn(email: string): Promise<string> {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ name: 'User', email, password: 'correct-horse-battery' });

    return (response.headers['set-cookie'] as unknown as string[])[0] ?? '';
  }

  it('requires authentication', async () => {
    for (const path of ['/api/dashboard/stats', '/api/dashboard/analytics']) {
      expect((await request(app).get(path)).status).toBe(401);
    }
  });

  it('returns dashboard stats grouped by status', async () => {
    const cookie = await signIn('dash@example.com');

    await request(app)
      .post('/api/sites')
      .set('Cookie', cookie)
      .send({ name: 'A', url: 'https://a.example.com' });
    await request(app)
      .post('/api/sites')
      .set('Cookie', cookie)
      .send({ name: 'B', url: 'https://b.example.com', monitoringEnabled: false });

    const response = await request(app).get('/api/dashboard/stats').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.totals).toMatchObject({ sites: 2, unknown: 1, paused: 1 });
    expect(response.body.data).toHaveProperty('uptime');
    expect(response.body.data).toHaveProperty('activeIncidents', 0);
  });

  it('rejects an unknown time range', async () => {
    const cookie = await signIn('range@example.com');

    const response = await request(app)
      .get('/api/dashboard/analytics?range=5y')
      .set('Cookie', cookie);

    expect(response.status).toBe(400);
  });

  it('refuses site analytics for another user’s site', async () => {
    const alice = await signIn('alice-analytics@example.com');
    const bob = await signIn('bob-analytics@example.com');

    const created = await request(app)
      .post('/api/sites')
      .set('Cookie', alice)
      .send({ name: 'Private', url: 'https://private.example.com' });

    const response = await request(app)
      .get(`/api/sites/${created.body.data.site.id}/analytics`)
      .set('Cookie', bob);

    expect(response.status).toBe(404);
  });

  it('paginates health history newest first', async () => {
    const cookie = await signIn('history@example.com');
    const created = await request(app)
      .post('/api/sites')
      .set('Cookie', cookie)
      .send({ name: 'Site', url: 'https://site.example.com' });

    const id = created.body.data.site.id;
    const ownerId = (await Site.findById(id))?.userId;

    for (let index = 0; index < 5; index += 1) {
      await HealthCheck.create({
        siteId: id,
        userId: ownerId,
        checkedAt: new Date(Date.now() - index * 60_000),
        success: true,
        statusCode: 200,
        responseTimeMs: 100 + index,
      });
    }

    const response = await request(app)
      .get(`/api/sites/${id}/health?limit=2`)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(2);
    expect(response.body.data.pagination).toMatchObject({ total: 5, hasMore: true });
    expect(response.body.data.items[0].responseTimeMs).toBe(100);
  });

  it('caps the health history page size', async () => {
    const cookie = await signIn('cap@example.com');
    const created = await request(app)
      .post('/api/sites')
      .set('Cookie', cookie)
      .send({ name: 'Site', url: 'https://site.example.com' });

    const response = await request(app)
      .get(`/api/sites/${created.body.data.site.id}/health?limit=5000`)
      .set('Cookie', cookie);

    // An unbounded limit would let one request pull a site's whole history.
    expect(response.status).toBe(400);
  });
});
