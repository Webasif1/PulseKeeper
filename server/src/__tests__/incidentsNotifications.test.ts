import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { Incident, Notification, Settings, Site } from '../models/index.js';
import { clearTestDb, connectTestDb, disconnectTestDb } from './helpers/db.js';
import { stubDnsPublic } from './helpers/dns.js';

const app = createApp();

async function signIn(email: string): Promise<{ cookie: string; userId: string }> {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ name: 'User', email, password: 'correct-horse-battery' });

  return {
    cookie: (response.headers['set-cookie'] as unknown as string[])[0] ?? '',
    userId: response.body.data.user.id,
  };
}

async function addSite(cookie: string, name = 'Recallix'): Promise<string> {
  const response = await request(app)
    .post('/api/sites')
    .set('Cookie', cookie)
    .send({ name, url: `https://${name.toLowerCase().replace(/\s/g, '')}.example.com` });

  return response.body.data.site.id;
}

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  stubDnsPublic();
});

afterAll(async () => {
  vi.restoreAllMocks();
  await disconnectTestDb();
});

describe('GET /api/incidents', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/incidents')).status).toBe(401);
  });

  it('returns incidents with the site name attached', async () => {
    const { cookie, userId } = await signIn('inc@example.com');
    const siteId = await addSite(cookie, 'Movie Spark');

    await Incident.create({
      siteId,
      userId,
      status: 'RESOLVED',
      reason: 'Server returned HTTP 503',
      startedAt: new Date(Date.now() - 3600_000),
      resolvedAt: new Date(Date.now() - 3000_000),
      durationSeconds: 600,
    });

    const response = await request(app).get('/api/incidents').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.items[0]).toMatchObject({
      siteName: 'Movie Spark',
      status: 'RESOLVED',
      reason: 'Server returned HTTP 503',
      durationSeconds: 600,
    });
  });

  it('reports a running duration for an open incident', async () => {
    const { cookie, userId } = await signIn('open@example.com');
    const siteId = await addSite(cookie);

    await Incident.create({
      siteId,
      userId,
      status: 'ACTIVE',
      reason: 'Timeout',
      startedAt: new Date(Date.now() - 120_000),
    });

    const response = await request(app).get('/api/incidents').set('Cookie', cookie);

    // The API computes it so the UI cannot disagree with the API about how
    // long an outage has lasted.
    expect(response.body.data.items[0].durationSeconds).toBeGreaterThanOrEqual(110);
    expect(response.body.data.items[0].resolvedAt).toBeUndefined();
  });

  it('filters by status', async () => {
    const { cookie, userId } = await signIn('filter-inc@example.com');
    const siteId = await addSite(cookie);

    await Incident.create({ siteId, userId, status: 'ACTIVE', reason: 'Down' });
    await Incident.create({
      siteId,
      userId,
      status: 'RESOLVED',
      reason: 'Was down',
      resolvedAt: new Date(),
      durationSeconds: 60,
    });

    const active = await request(app).get('/api/incidents?status=ACTIVE').set('Cookie', cookie);
    const all = await request(app).get('/api/incidents?status=ALL').set('Cookie', cookie);

    expect(active.body.data.items).toHaveLength(1);
    expect(active.body.data.items[0].status).toBe('ACTIVE');
    expect(all.body.data.items).toHaveLength(2);
  });

  it('lists active incidents before resolved ones', async () => {
    const { cookie, userId } = await signIn('sort-inc@example.com');
    const siteId = await addSite(cookie);

    // Resolved one is newer, but an ongoing outage matters more than history.
    await Incident.create({
      siteId,
      userId,
      status: 'ACTIVE',
      reason: 'Ongoing',
      startedAt: new Date(Date.now() - 7200_000),
    });
    await Incident.create({
      siteId: new mongoose.Types.ObjectId(),
      userId,
      status: 'RESOLVED',
      reason: 'Older',
      startedAt: new Date(Date.now() - 600_000),
      resolvedAt: new Date(),
      durationSeconds: 60,
    });

    const response = await request(app).get('/api/incidents').set('Cookie', cookie);

    expect(response.body.data.items[0].status).toBe('ACTIVE');
  });

  it('never returns another user’s incidents', async () => {
    const alice = await signIn('alice-inc@example.com');
    const bob = await signIn('bob-inc@example.com');
    const siteId = await addSite(alice.cookie);

    const incident = await Incident.create({
      siteId,
      userId: alice.userId,
      status: 'ACTIVE',
      reason: 'Private',
    });

    const list = await request(app).get('/api/incidents').set('Cookie', bob.cookie);
    const direct = await request(app)
      .get(`/api/incidents/${incident.id}`)
      .set('Cookie', bob.cookie);

    expect(list.body.data.items).toHaveLength(0);
    expect(direct.status).toBe(404);
  });

  it('still lists an incident whose site was deleted', async () => {
    const { cookie, userId } = await signIn('orphan@example.com');
    const siteId = await addSite(cookie);

    await Incident.create({ siteId, userId, status: 'ACTIVE', reason: 'Down' });
    await Site.deleteOne({ _id: siteId });

    const response = await request(app).get('/api/incidents').set('Cookie', cookie);

    // The cascade normally removes these together; a blank row would still be
    // better than a crash if they ever diverge.
    expect(response.body.data.items[0].siteName).toBe('Deleted site');
  });
});

describe('notifications', () => {
  async function seedNotification(userId: string, read = false) {
    return Notification.create({
      userId,
      type: 'SITE_DOWN',
      title: 'Recallix is down',
      message: 'Server returned HTTP 503',
      read,
    });
  }

  it('returns items with an unread count for the badge', async () => {
    const { cookie, userId } = await signIn('notif@example.com');
    await seedNotification(userId);
    await seedNotification(userId);
    await seedNotification(userId, true);

    const response = await request(app).get('/api/notifications').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(3);
    expect(response.body.data.unreadCount).toBe(2);
  });

  it('keeps the unread count unfiltered while filtering the list', async () => {
    const { cookie, userId } = await signIn('unread@example.com');
    await seedNotification(userId);
    await seedNotification(userId, true);

    const response = await request(app)
      .get('/api/notifications?unreadOnly=true')
      .set('Cookie', cookie);

    // The badge shows total unread regardless of the panel's current filter,
    // so the client never needs a second request for it.
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.unreadCount).toBe(1);
  });

  it('marks one as read', async () => {
    const { cookie, userId } = await signIn('markread@example.com');
    const notification = await seedNotification(userId);

    const response = await request(app)
      .patch(`/api/notifications/${notification.id}/read`)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.notification.read).toBe(true);
  });

  it('marks all as read', async () => {
    const { cookie, userId } = await signIn('markall@example.com');
    await seedNotification(userId);
    await seedNotification(userId);

    const response = await request(app)
      .patch('/api/notifications/read-all')
      .set('Cookie', cookie);

    expect(response.body.data.updated).toBe(2);
    expect(await Notification.countDocuments({ userId, read: false })).toBe(0);
  });

  it('refuses to mark another user’s notification as read', async () => {
    const alice = await signIn('alice-notif@example.com');
    const bob = await signIn('bob-notif@example.com');
    const notification = await seedNotification(alice.userId);

    const response = await request(app)
      .patch(`/api/notifications/${notification.id}/read`)
      .set('Cookie', bob.cookie);

    expect(response.status).toBe(404);
    expect((await Notification.findById(notification.id))?.read).toBe(false);
  });
});

describe('settings', () => {
  it('returns the defaults created at registration', async () => {
    const { cookie } = await signIn('settings@example.com');

    const response = await request(app).get('/api/settings').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.settings).toMatchObject({
      defaultIntervalMinutes: 5,
      defaultTimeoutSeconds: 10,
      dataRetentionDays: 30,
      theme: 'system',
    });
  });

  it('updates only the fields provided', async () => {
    const { cookie } = await signIn('update-settings@example.com');

    const response = await request(app)
      .patch('/api/settings')
      .set('Cookie', cookie)
      .send({ theme: 'dark', dataRetentionDays: 90 });

    expect(response.body.data.settings).toMatchObject({
      theme: 'dark',
      dataRetentionDays: 90,
      defaultIntervalMinutes: 5,
    });
  });

  it('merges a partial notifications object instead of replacing it', async () => {
    const { cookie } = await signIn('partial-notif@example.com');

    const response = await request(app)
      .patch('/api/settings')
      .set('Cookie', cookie)
      .send({ notifications: { onSlow: true } });

    // Replacing the object would silently switch off onDown and onUp.
    expect(response.body.data.settings.notifications).toEqual({
      onDown: true,
      onUp: true,
      onSlow: true,
    });
  });

  it('rejects a retention window that is not offered', async () => {
    const { cookie } = await signIn('bad-retention@example.com');

    const response = await request(app)
      .patch('/api/settings')
      .set('Cookie', cookie)
      .send({ dataRetentionDays: 45 });

    expect(response.status).toBe(400);
  });

  it('rejects an unknown field', async () => {
    const { cookie } = await signIn('unknown-field@example.com');

    const response = await request(app)
      .patch('/api/settings')
      .set('Cookie', cookie)
      .send({ isAdmin: true });

    expect(response.status).toBe(400);
  });

  it('does not let one user read another’s settings', async () => {
    const alice = await signIn('alice-settings@example.com');
    await signIn('bob-settings@example.com');

    await request(app)
      .patch('/api/settings')
      .set('Cookie', alice.cookie)
      .send({ theme: 'dark' });

    const bobSettings = await Settings.findOne({ userId: alice.userId });
    expect(bobSettings?.theme).toBe('dark');

    const response = await request(app).get('/api/settings').set('Cookie', alice.cookie);
    expect(response.body.data.settings.theme).toBe('dark');
  });
});

describe('GET /api/monitor/runs', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/monitor/runs')).status).toBe(401);
  });

  it('exposes the run counter as `errors`, matching the spec', async () => {
    const { cookie } = await signIn('runs@example.com');
    const { MonitorRun } = await import('../models/index.js');

    await MonitorRun.create({
      startedAt: new Date(),
      finishedAt: new Date(),
      checked: 3,
      online: 2,
      offline: 1,
      errorCount: 1,
    });

    const response = await request(app).get('/api/monitor/runs').set('Cookie', cookie);

    // Stored as errorCount because `errors` is a reserved Mongoose path.
    expect(response.body.data.items[0]).toMatchObject({ checked: 3, errors: 1 });
    expect(response.body.data.items[0].errorCount).toBeUndefined();
  });
});
