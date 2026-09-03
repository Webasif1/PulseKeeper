import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as HealthCheckService from '../services/healthCheck.service.js';
import type { HealthCheckOutcome } from '../services/healthCheck.service.js';

const runHealthCheck = vi.hoisted(() => vi.fn());

vi.mock('../services/healthCheck.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof HealthCheckService>();
  return { ...actual, runHealthCheck };
});

const { createApp } = await import('../app.js');
const { HealthCheck, Site } = await import('../models/index.js');
const { clearTestDb, connectTestDb, disconnectTestDb } = await import('./helpers/db.js');
const { stubDnsPublic } = await import('./helpers/dns.js');

const app = createApp();

/** Matches MONITOR_CRON_SECRET in the test setup file. */
const MONITOR_SECRET = 'test-monitor-secret';

const onlineResult: HealthCheckOutcome = {
  success: true,
  status: 'ONLINE',
  statusCode: 200,
  responseTimeMs: 142,
  redirects: 0,
};

async function createUser(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Test User', email, password: 'correct-horse-battery' });

  return (response.headers['set-cookie'] as unknown as string[])[0] ?? '';
}

async function addSite(cookie: string): Promise<string> {
  const response = await request(app)
    .post('/api/sites')
    .set('Cookie', cookie)
    .send({ name: 'Recallix', url: 'https://recallix.example.com' });

  return response.body.data.site.id;
}

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  runHealthCheck.mockReset().mockResolvedValue(onlineResult);
  stubDnsPublic();
});

afterAll(async () => {
  vi.restoreAllMocks();
  await disconnectTestDb();
});

describe('POST /api/monitor/run', () => {
  it('refuses a request with no secret', async () => {
    const response = await request(app).post('/api/monitor/run');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('refuses a wrong secret', async () => {
    const response = await request(app)
      .post('/api/monitor/run')
      .set('x-monitor-secret', 'not-the-secret');

    expect(response.status).toBe(401);
  });

  it('refuses a secret that is a prefix of the real one', async () => {
    // A length mismatch must not be treated as a match, and must not be
    // distinguishable by timing.
    const response = await request(app)
      .post('/api/monitor/run')
      .set('x-monitor-secret', MONITOR_SECRET.slice(0, 5));

    expect(response.status).toBe(401);
  });

  it('does not accept a user session in place of the secret', async () => {
    const cookie = await createUser('session@example.com');

    const response = await request(app).post('/api/monitor/run').set('Cookie', cookie);

    expect(response.status).toBe(401);
  });

  it('runs a sweep with the correct secret and returns the summary', async () => {
    const cookie = await createUser('trigger@example.com');
    await addSite(cookie);

    const response = await request(app)
      .post('/api/monitor/run')
      .set('x-monitor-secret', MONITOR_SECRET);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      checked: 1,
      online: 1,
      slow: 0,
      offline: 0,
      errors: 0,
    });
  });

  it('marks externally triggered checks as such', async () => {
    const cookie = await createUser('external@example.com');
    await addSite(cookie);

    await request(app).post('/api/monitor/run').set('x-monitor-secret', MONITOR_SECRET);

    const check = await HealthCheck.findOne();
    expect(check?.source).toBe('EXTERNAL');
  });
});

describe('POST /api/sites/:id/check', () => {
  it('requires authentication', async () => {
    const response = await request(app).post('/api/sites/507f1f77bcf86cd799439011/check');

    expect(response.status).toBe(401);
  });

  it('checks the site immediately and returns its updated state', async () => {
    const cookie = await createUser('checknow@example.com');
    const siteId = await addSite(cookie);

    const response = await request(app).post(`/api/sites/${siteId}/check`).set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.site).toMatchObject({
      currentStatus: 'ONLINE',
      currentResponseTime: 142,
    });

    const check = await HealthCheck.findOne({ siteId });
    expect(check?.source).toBe('MANUAL');
  });

  it('returns 404 for another user’s site and does not check it', async () => {
    const alice = await createUser('alice-check@example.com');
    const bob = await createUser('bob-check@example.com');
    const siteId = await addSite(alice);

    const response = await request(app).post(`/api/sites/${siteId}/check`).set('Cookie', bob);

    expect(response.status).toBe(404);
    expect(runHealthCheck).not.toHaveBeenCalled();
    expect(await HealthCheck.countDocuments()).toBe(0);
  });

  it('checks a paused site when asked explicitly', async () => {
    const cookie = await createUser('paused-check@example.com');
    const siteId = await addSite(cookie);
    await Site.updateOne({ _id: siteId }, { $set: { monitoringEnabled: false } });

    const response = await request(app).post(`/api/sites/${siteId}/check`).set('Cookie', cookie);

    // Pausing stops the schedule, not the button: an explicit request is a
    // deliberate act.
    expect(response.status).toBe(200);
    expect(runHealthCheck).toHaveBeenCalled();
  });
});
