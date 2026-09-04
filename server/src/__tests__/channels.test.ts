import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as HttpModule from '../services/channels/http.js';

/**
 * The outbound POST is stubbed so nothing leaves the machine, but the SSRF
 * guard is deliberately left real — this suite's most important assertions are
 * that a webhook pointing at loopback or cloud metadata is refused, and a mock
 * guard could not prove that.
 */
const postJson = vi.hoisted(() => vi.fn());

vi.mock('../services/channels/http.js', async (importOriginal) => {
  const actual = await importOriginal<typeof HttpModule>();
  return { ...actual, postJson };
});

const { createApp } = await import('../app.js');
const { NotificationChannel } = await import('../models/index.js');
const { clearTestDb, connectTestDb, disconnectTestDb } = await import('./helpers/db.js');
const { stubDnsPublic, stubDnsAddresses } = await import('./helpers/dns.js');

const app = createApp();

const SLACK_URL = 'https://hooks.slack.com/services/T000/B000/abcdefghijklmnop';
const DISCORD_URL = 'https://discord.com/api/webhooks/123/abcdefghijklmnop';

async function signIn(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Test User', email, password: 'correct-horse-battery' });

  return (response.headers['set-cookie'] as unknown as string[])[0] ?? '';
}

async function addChannel(cookie: string, body: Record<string, unknown>) {
  return request(app).post('/api/channels').set('Cookie', cookie).send(body);
}

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  postJson.mockReset().mockResolvedValue(undefined);
  stubDnsPublic();
});

afterAll(async () => {
  vi.restoreAllMocks();
  await disconnectTestDb();
});

describe('authentication', () => {
  it('rejects anonymous access', async () => {
    expect((await request(app).get('/api/channels')).status).toBe(401);
    expect((await request(app).post('/api/channels').send({})).status).toBe(401);
  });
});

describe('SSRF protection on webhook targets', () => {
  it.each([
    ['http://localhost:3000/hook', 'localhost'],
    ['http://127.0.0.1/hook', 'loopback'],
    ['http://169.254.169.254/latest/meta-data/', 'cloud metadata'],
    ['http://10.0.0.1/hook', 'private range'],
    ['http://[::1]/hook', 'IPv6 loopback'],
    ['file:///etc/passwd', 'file scheme'],
  ])('refuses to store a webhook pointing at %s (%s)', async (target) => {
    const cookie = await signIn(`ssrf-${Math.random()}@example.com`);

    const response = await addChannel(cookie, { type: 'WEBHOOK', name: 'Bad', target });

    // A webhook URL is user input the server later fetches. Unguarded, this
    // would turn notification delivery into a way to reach internal services
    // and receive the response somewhere the attacker controls.
    expect(response.status).toBe(400);
    expect(await NotificationChannel.countDocuments()).toBe(0);
  });

  it('refuses a public hostname that resolves to a private address', async () => {
    const cookie = await signIn('rebind@example.com');
    stubDnsAddresses([{ address: '127.0.0.1', family: 4 }]);

    const response = await addChannel(cookie, {
      type: 'WEBHOOK',
      name: 'Sneaky',
      target: 'https://sneaky.example.com/hook',
    });

    expect(response.status).toBe(400);
  });

  it('requires https, since a webhook URL is a bearer secret', async () => {
    const cookie = await signIn('plain-http@example.com');

    const response = await addChannel(cookie, {
      type: 'WEBHOOK',
      name: 'Insecure',
      target: 'http://public.example.com/hook',
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/https/i);
  });

  it('checks the target again when it is changed', async () => {
    const cookie = await signIn('update-ssrf@example.com');
    const created = await addChannel(cookie, {
      type: 'WEBHOOK',
      name: 'Fine',
      target: 'https://public.example.com/hook',
    });

    const response = await request(app)
      .patch(`/api/channels/${created.body.data.channel.id}`)
      .set('Cookie', cookie)
      .send({ target: 'http://169.254.169.254/' });

    expect(response.status).toBe(400);
  });
});

describe('target validation per type', () => {
  it('accepts a Slack webhook URL', async () => {
    const cookie = await signIn('slack@example.com');

    const response = await addChannel(cookie, {
      type: 'SLACK',
      name: 'Team Slack',
      target: SLACK_URL,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.channel).toMatchObject({ type: 'SLACK', name: 'Team Slack' });
  });

  it('rejects a Slack channel pointing somewhere that is not Slack', async () => {
    const cookie = await signIn('not-slack@example.com');

    const response = await addChannel(cookie, {
      type: 'SLACK',
      name: 'Wrong',
      target: 'https://public.example.com/hook',
    });

    expect(response.status).toBe(400);
  });

  it('accepts a Discord webhook URL', async () => {
    const cookie = await signIn('discord@example.com');

    expect(
      (await addChannel(cookie, { type: 'DISCORD', name: 'Server', target: DISCORD_URL })).status,
    ).toBe(201);
  });

  it('rejects an email channel when SMTP is not configured', async () => {
    const cookie = await signIn('email@example.com');

    // The test environment has no SMTP settings, so email must be refused
    // rather than accepted and silently never delivered.
    const response = await addChannel(cookie, {
      type: 'EMAIL',
      name: 'Inbox',
      target: 'alerts@example.com',
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/SMTP/i);
  });
});

describe('secret handling', () => {
  it('never returns the full webhook URL', async () => {
    const cookie = await signIn('secret@example.com');
    await addChannel(cookie, { type: 'SLACK', name: 'Team', target: SLACK_URL });

    const response = await request(app).get('/api/channels').set('Cookie', cookie);
    const body = JSON.stringify(response.body);

    // Anyone holding a Slack incoming-webhook URL can post to that channel, so
    // it must not reach the browser, an extension reading the page, or a proxy
    // log along the way.
    expect(body).not.toContain('abcdefghijklmnop');
    expect(response.body.data.channels[0].targetPreview).toContain('hooks.slack.com');
    expect(response.body.data.channels[0].target).toBeUndefined();
  });
});

describe('tenant isolation', () => {
  it('lists only the requesting user’s channels', async () => {
    const alice = await signIn('alice-ch@example.com');
    const bob = await signIn('bob-ch@example.com');

    await addChannel(alice, { type: 'SLACK', name: 'Alice Slack', target: SLACK_URL });

    const response = await request(app).get('/api/channels').set('Cookie', bob);

    expect(response.body.data.channels).toHaveLength(0);
  });

  it.each([
    ['patch', 'editing'],
    ['delete', 'deleting'],
  ])('returns 404 when %s another user’s channel', async (method) => {
    const alice = await signIn(`alice-${method}@example.com`);
    const bob = await signIn(`bob-${method}@example.com`);
    const created = await addChannel(alice, {
      type: 'SLACK',
      name: 'Private',
      target: SLACK_URL,
    });

    const id = created.body.data.channel.id;
    const response =
      method === 'patch'
        ? await request(app).patch(`/api/channels/${id}`).set('Cookie', bob).send({ name: 'X' })
        : await request(app).delete(`/api/channels/${id}`).set('Cookie', bob);

    expect(response.status).toBe(404);
  });

  it('refuses to send a test through another user’s channel', async () => {
    const alice = await signIn('alice-test@example.com');
    const bob = await signIn('bob-test@example.com');
    const created = await addChannel(alice, { type: 'SLACK', name: 'P', target: SLACK_URL });

    const response = await request(app)
      .post(`/api/channels/${created.body.data.channel.id}/test`)
      .set('Cookie', bob);

    expect(response.status).toBe(404);
    expect(postJson).not.toHaveBeenCalled();
  });
});

describe('managing channels', () => {
  it('caps the number of channels per user', async () => {
    const cookie = await signIn('many@example.com');

    for (let index = 0; index < 10; index += 1) {
      await addChannel(cookie, { type: 'SLACK', name: `Slack ${index}`, target: SLACK_URL });
    }

    const response = await addChannel(cookie, {
      type: 'SLACK',
      name: 'One too many',
      target: SLACK_URL,
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/at most 10/);
  });

  it('sends a test message through the adapter', async () => {
    const cookie = await signIn('test-send@example.com');
    const created = await addChannel(cookie, { type: 'SLACK', name: 'T', target: SLACK_URL });

    const response = await request(app)
      .post(`/api/channels/${created.body.data.channel.id}/test`)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(postJson).toHaveBeenCalledOnce();
    expect(postJson.mock.calls[0]?.[0]).toBe(SLACK_URL);
  });

  it('reports a failed test rather than swallowing it', async () => {
    const cookie = await signIn('test-fail@example.com');
    const created = await addChannel(cookie, { type: 'SLACK', name: 'T', target: SLACK_URL });
    postJson.mockRejectedValueOnce(new Error('Endpoint returned HTTP 404: no_service'));

    const response = await request(app)
      .post(`/api/channels/${created.body.data.channel.id}/test`)
      .set('Cookie', cookie);

    // Someone pressing "Send test" is asking whether it works; the failure is
    // the answer they need.
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('no_service');

    const stored = await NotificationChannel.findById(created.body.data.channel.id);
    expect(stored?.lastError).toContain('no_service');
  });

  it('clears the failure history when the target changes', async () => {
    const cookie = await signIn('reset@example.com');
    const created = await addChannel(cookie, { type: 'SLACK', name: 'T', target: SLACK_URL });
    const id = created.body.data.channel.id;

    await NotificationChannel.updateOne(
      { _id: id },
      { $set: { consecutiveFailures: 4, lastError: 'old failure' } },
    );

    await request(app)
      .patch(`/api/channels/${id}`)
      .set('Cookie', cookie)
      .send({ target: `${SLACK_URL}z` });

    // A new destination is not described by the old destination's failures.
    const stored = await NotificationChannel.findById(id);
    expect(stored?.consecutiveFailures).toBe(0);
    expect(stored?.lastError).toBeUndefined();
  });

  it('deletes a channel', async () => {
    const cookie = await signIn('delete-ch@example.com');
    const created = await addChannel(cookie, { type: 'SLACK', name: 'T', target: SLACK_URL });

    const response = await request(app)
      .delete(`/api/channels/${created.body.data.channel.id}`)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(await NotificationChannel.countDocuments()).toBe(0);
  });
});
