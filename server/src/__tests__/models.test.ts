import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { HealthCheck, Incident, Settings, Site, User } from '../models/index.js';
import { IncidentStatus, SiteStatus } from '../types/domain.js';
import { clearTestDb, connectTestDb, disconnectTestDb } from './helpers/db.js';

const userId = new mongoose.Types.ObjectId();
const siteId = new mongoose.Types.ObjectId();

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('Site model', () => {
  it('applies the configured monitoring defaults', async () => {
    const site = await Site.create({ userId, name: 'Recallix', url: 'https://example.com' });

    expect(site.intervalMinutes).toBe(5);
    expect(site.timeoutSeconds).toBe(10);
    expect(site.slowThresholdMs).toBe(3000);
    expect(site.failureThreshold).toBe(3);
    expect(site.monitoringEnabled).toBe(true);
    expect(site.currentStatus).toBe(SiteStatus.UNKNOWN);
    expect(site.consecutiveFailures).toBe(0);
    expect(site.isDemo).toBe(false);
  });

  it('falls back to the main URL when no health endpoint is set', async () => {
    const site = await Site.create({ userId, name: 'Recallix', url: 'https://example.com' });

    expect(site.get('checkUrl')).toBe('https://example.com');
  });

  it('prefers the health endpoint when one is set', async () => {
    const site = await Site.create({
      userId,
      name: 'Recallix',
      url: 'https://example.com',
      healthEndpoint: 'https://example.com/api/health',
    });

    expect(site.get('checkUrl')).toBe('https://example.com/api/health');
  });

  it('rejects more tags than the configured maximum', async () => {
    const tags = Array.from({ length: 11 }, (_, index) => `tag-${index}`);

    await expect(
      Site.create({ userId, name: 'Recallix', url: 'https://example.com', tags }),
    ).rejects.toThrow(/at most 10 tags/);
  });

  it('rejects an out-of-range failure threshold', async () => {
    await expect(
      Site.create({
        userId,
        name: 'Recallix',
        url: 'https://example.com',
        failureThreshold: 99,
      }),
    ).rejects.toThrow();
  });
});

describe('Incident model', () => {
  it('allows only one active incident per site', async () => {
    await Incident.create({ siteId, userId, reason: 'HTTP 503', startedAt: new Date() });

    // The partial unique index is what enforces this, not service logic: a
    // manual check racing the cron sweep must not open a duplicate.
    await expect(
      Incident.create({ siteId, userId, reason: 'HTTP 500', startedAt: new Date() }),
    ).rejects.toThrow(/duplicate key/i);
  });

  it('allows a new incident once the previous one is resolved', async () => {
    const first = await Incident.create({ siteId, userId, reason: 'HTTP 503' });
    first.status = IncidentStatus.RESOLVED;
    first.resolvedAt = new Date();
    await first.save();

    const second = await Incident.create({ siteId, userId, reason: 'Timeout' });

    expect(second.status).toBe(IncidentStatus.ACTIVE);
  });

  it('allows concurrent active incidents on different sites', async () => {
    const otherSiteId = new mongoose.Types.ObjectId();

    await Incident.create({ siteId, userId, reason: 'HTTP 503' });
    const other = await Incident.create({ siteId: otherSiteId, userId, reason: 'Timeout' });

    expect(other.id).toBeDefined();
  });
});

describe('HealthCheck model', () => {
  it('stores a successful check', async () => {
    const check = await HealthCheck.create({
      siteId,
      userId,
      success: true,
      statusCode: 200,
      responseTimeMs: 382,
    });

    expect(check.success).toBe(true);
    expect(check.checkedAt).toBeInstanceOf(Date);
    expect(check.source).toBe('CRON');
  });

  it('stores a transport failure with no status code or duration', async () => {
    const check = await HealthCheck.create({
      siteId,
      userId,
      success: false,
      errorType: 'TIMEOUT',
      errorMessage: 'Request timed out',
    });

    expect(check.statusCode).toBeUndefined();
    expect(check.responseTimeMs).toBeUndefined();
    expect(check.errorType).toBe('TIMEOUT');
  });

  it('rejects an unrecognised error type', async () => {
    await expect(
      HealthCheck.create({ siteId, userId, success: false, errorType: 'NOPE' }),
    ).rejects.toThrow();
  });

  it('indexes site history for time-window queries', async () => {
    const indexes = await HealthCheck.collection.indexes();
    const names = indexes.map((index) => JSON.stringify(index.key));

    expect(names).toContain('{"siteId":1,"checkedAt":-1}');
    expect(names).toContain('{"userId":1,"checkedAt":-1}');
    expect(names).toContain('{"checkedAt":1}');
  });
});

describe('Settings model', () => {
  it('allows only one settings document per user', async () => {
    await Settings.create({ userId });

    await expect(Settings.create({ userId })).rejects.toThrow(/duplicate key/i);
  });

  it('rejects a retention window that is not offered in the UI', async () => {
    await expect(Settings.create({ userId, dataRetentionDays: 45 })).rejects.toThrow();
  });
});

describe('User model', () => {
  it('enforces unique emails', async () => {
    await User.create({ name: 'One', email: 'dup@example.com', password: 'password123' });

    await expect(
      User.create({ name: 'Two', email: 'dup@example.com', password: 'password123' }),
    ).rejects.toThrow(/duplicate key/i);
  });

  it('re-hashes only when the password changes', async () => {
    const user = await User.create({
      name: 'Asif',
      email: 'rehash@example.com',
      password: 'password123',
    });
    const originalHash = user.password;

    user.name = 'Asif Rahman';
    await user.save();

    expect(user.password).toBe(originalHash);
  });
});
