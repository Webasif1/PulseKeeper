import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { Notification, Settings, Site, User } from '../models/index.js';
import { handleCertificate, shouldWarn, warningBandFor } from '../services/ssl.service.js';
import { clearTestDb, connectTestDb, disconnectTestDb } from './helpers/db.js';

import type { TlsCertificateInfo } from '../services/healthCheck.service.js';

function certificate(daysRemaining: number): TlsCertificateInfo {
  return {
    validTo: new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000),
    issuer: "Let's Encrypt",
    daysRemaining,
  };
}

let userId: mongoose.Types.ObjectId;

async function createSite(overrides: Record<string, unknown> = {}) {
  const site = await Site.create({
    userId,
    name: 'Recallix',
    url: 'https://recallix.example.com',
    ...overrides,
  });

  return (await Site.findById(site._id).lean()) as NonNullable<
    Awaited<ReturnType<typeof Site.findById>>
  > & { _id: mongoose.Types.ObjectId };
}

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  const user = await User.create({
    name: 'Asif',
    email: 'ssl@example.com',
    password: 'password123',
  });
  userId = user._id;
  await Settings.create({ userId });
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('warningBandFor', () => {
  it('returns the tightest band that has been crossed', () => {
    expect(warningBandFor(45)).toBeNull();
    expect(warningBandFor(30)).toBe(30);
    expect(warningBandFor(20)).toBe(30);
    expect(warningBandFor(14)).toBe(14);
    expect(warningBandFor(8)).toBe(14);
    expect(warningBandFor(7)).toBe(7);
    expect(warningBandFor(2)).toBe(7);
    expect(warningBandFor(1)).toBe(1);
    expect(warningBandFor(0)).toBe(1);
    expect(warningBandFor(-5)).toBe(1);
  });
});

describe('shouldWarn', () => {
  it('warns the first time a band is entered', () => {
    expect(shouldWarn(29, undefined)).toBe(true);
  });

  it('stays quiet within a band already announced', () => {
    // A daily "expires in 22 days" for a month is how people learn to ignore
    // alerts.
    expect(shouldWarn(22, 30)).toBe(false);
    expect(shouldWarn(15, 30)).toBe(false);
  });

  it('warns again when the band tightens', () => {
    expect(shouldWarn(13, 30)).toBe(true);
    expect(shouldWarn(6, 14)).toBe(true);
    expect(shouldWarn(0, 7)).toBe(true);
  });

  it('says nothing for a comfortably valid certificate', () => {
    expect(shouldWarn(60, undefined)).toBe(false);
  });
});

describe('handleCertificate', () => {
  it('records the certificate without warning when it is far from expiry', async () => {
    const site = await createSite();

    const update = await handleCertificate(site, certificate(85));

    expect(update.sslDaysRemaining).toBe(85);
    expect(update.sslIssuer).toBe("Let's Encrypt");
    expect(update.sslWarnedAtDays).toBeUndefined();
    expect(await Notification.countDocuments()).toBe(0);
  });

  it('notifies once when a band is entered', async () => {
    const site = await createSite();

    const update = await handleCertificate(site, certificate(25));

    expect(update.sslWarnedAtDays).toBe(30);

    const notifications = await Notification.find();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ type: 'SSL_EXPIRING' });
    expect(notifications[0]?.title).toContain('25 days');
  });

  it('does not notify again inside the same band', async () => {
    const site = await createSite({ sslWarnedAtDays: 30 });

    await handleCertificate(site, certificate(18));

    expect(await Notification.countDocuments()).toBe(0);
  });

  it('notifies again once the band tightens', async () => {
    const site = await createSite({ sslWarnedAtDays: 30 });

    const update = await handleCertificate(site, certificate(10));

    expect(update.sslWarnedAtDays).toBe(14);
    expect(await Notification.countDocuments()).toBe(1);
  });

  it('reports an expired certificate distinctly', async () => {
    const site = await createSite();

    await handleCertificate(site, certificate(-3));

    const notification = await Notification.findOne();
    expect(notification?.type).toBe('SSL_EXPIRED');
    expect(notification?.title).toContain('expired');
    // Visitors see a browser warning, which is worse than slow — the copy says so.
    expect(notification?.message).toContain('security warning');
  });

  it('clears the warning record when the certificate is renewed', async () => {
    const site = await createSite({ sslWarnedAtDays: 7 });

    await handleCertificate(site, certificate(89));

    // A renewal must re-arm the warnings, or the next genuine approach would
    // pass in silence.
    const stored = await Site.findById(site._id);
    expect(stored?.sslWarnedAtDays).toBeUndefined();
    expect(await Notification.countDocuments()).toBe(0);
  });

  it('respects a user who turned certificate warnings off', async () => {
    await Settings.updateOne({ userId }, { $set: { 'notifications.onSslExpiry': false } });
    const site = await createSite();

    const update = await handleCertificate(site, certificate(5));

    // The observation is still recorded — the dashboard should show it — but
    // nothing is announced.
    expect(update.sslDaysRemaining).toBe(5);
    expect(await Notification.countDocuments()).toBe(0);
  });
});
