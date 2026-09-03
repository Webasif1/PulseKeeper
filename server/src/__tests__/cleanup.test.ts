import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runRetentionCleanup } from '../jobs/cleanupJob.js';
import { HealthCheck, MonitorRun, Settings, User } from '../models/index.js';
import { clearTestDb, connectTestDb, disconnectTestDb } from './helpers/db.js';

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function createUserWithRetention(email: string, retentionDays: number) {
  const user = await User.create({ name: 'Test', email, password: 'password123' });
  await Settings.create({ userId: user._id, dataRetentionDays: retentionDays });
  return user._id;
}

async function seedCheck(userId: mongoose.Types.ObjectId, checkedAt: Date) {
  await HealthCheck.create({
    siteId: new mongoose.Types.ObjectId(),
    userId,
    checkedAt,
    success: true,
    statusCode: 200,
    responseTimeMs: 100,
  });
}

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('runRetentionCleanup', () => {
  it('deletes checks older than the user’s retention window', async () => {
    const userId = await createUserWithRetention('thirty@example.com', 30);
    await seedCheck(userId, daysAgo(45));
    await seedCheck(userId, daysAgo(10));

    const result = await runRetentionCleanup();

    expect(result.deletedChecks).toBe(1);
    expect(await HealthCheck.countDocuments()).toBe(1);
  });

  it('applies each user’s own window rather than a global one', async () => {
    const shortRetention = await createUserWithRetention('seven@example.com', 7);
    const longRetention = await createUserWithRetention('ninety@example.com', 90);

    // The same age, two different outcomes.
    await seedCheck(shortRetention, daysAgo(30));
    await seedCheck(longRetention, daysAgo(30));

    await runRetentionCleanup();

    expect(await HealthCheck.countDocuments({ userId: shortRetention })).toBe(0);
    expect(await HealthCheck.countDocuments({ userId: longRetention })).toBe(1);
  });

  it('keeps a check exactly inside the window', async () => {
    const userId = await createUserWithRetention('boundary@example.com', 30);
    await seedCheck(userId, daysAgo(29));

    await runRetentionCleanup();

    expect(await HealthCheck.countDocuments()).toBe(1);
  });

  it('prunes old monitor-run records', async () => {
    await MonitorRun.create({ startedAt: daysAgo(45), checked: 1 });
    await MonitorRun.create({ startedAt: daysAgo(5), checked: 1 });

    const result = await runRetentionCleanup();

    expect(result.deletedRuns).toBe(1);
    expect(await MonitorRun.countDocuments()).toBe(1);
  });

  it('does nothing when there is nothing to delete', async () => {
    const userId = await createUserWithRetention('fresh@example.com', 30);
    await seedCheck(userId, daysAgo(1));

    const result = await runRetentionCleanup();

    expect(result).toEqual({ deletedChecks: 0, deletedRuns: 0 });
  });
});
