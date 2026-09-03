import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { HealthCheck, Incident, Notification, Site } from '../models/index.js';
import { clearTestDb, connectTestDb, disconnectTestDb } from './helpers/db.js';
import { stubDnsAddresses, stubDnsPublic } from './helpers/dns.js';

const app = createApp();

type HttpMethod = 'get' | 'post' | 'patch' | 'delete';

/** Issue a request by method name, without indexing into supertest's types. */
function send(method: HttpMethod, path: string): request.Test {
  switch (method) {
    case 'get':
      return request(app).get(path);
    case 'post':
      return request(app).post(path);
    case 'patch':
      return request(app).patch(path);
    case 'delete':
      return request(app).delete(path);
  }
}

/** Register a user and return their auth cookie plus id. */
async function createUser(email: string): Promise<{ cookie: string; id: string }> {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Test User', email, password: 'correct-horse-battery' });

  const cookies = response.headers['set-cookie'] as unknown as string[];
  return { cookie: cookies[0] ?? '', id: response.body.data.user.id };
}

async function addSite(
  cookie: string,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, string>> {
  const response = await request(app)
    .post('/api/sites')
    .set('Cookie', cookie)
    .send({ name: 'Recallix', url: 'https://recallix.example.com', ...overrides });

  return response.body.data?.site ?? {};
}

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  // Every hostname in these tests resolves to a public address unless a test
  // says otherwise, so the suite never depends on the internet.
  stubDnsPublic();
});

afterAll(async () => {
  vi.restoreAllMocks();
  await disconnectTestDb();
});

describe('authentication', () => {
  it.each([
    ['get', '/api/sites'],
    ['post', '/api/sites'],
    ['get', '/api/sites/507f1f77bcf86cd799439011'],
    ['patch', '/api/sites/507f1f77bcf86cd799439011'],
    ['delete', '/api/sites/507f1f77bcf86cd799439011'],
  ])('rejects an anonymous %s %s', async (method, path) => {
    const response = await send(method as HttpMethod, path);

    expect(response.status).toBe(401);
  });
});

describe('POST /api/sites', () => {
  it('creates a site with the configured defaults', async () => {
    const { cookie } = await createUser('create@example.com');

    const response = await request(app)
      .post('/api/sites')
      .set('Cookie', cookie)
      .send({ name: 'Recallix', url: 'https://recallix.example.com' });

    expect(response.status).toBe(201);
    expect(response.body.data.site).toMatchObject({
      name: 'Recallix',
      intervalMinutes: 5,
      timeoutSeconds: 10,
      slowThresholdMs: 3000,
      failureThreshold: 3,
      currentStatus: 'UNKNOWN',
      monitoringEnabled: true,
    });
  });

  it('accepts the full field set', async () => {
    const { cookie } = await createUser('full@example.com');

    const response = await request(app)
      .post('/api/sites')
      .set('Cookie', cookie)
      .send({
        name: 'Movie Spark',
        url: 'https://moviespark.example.com',
        healthEndpoint: 'https://moviespark.example.com/api/health',
        description: 'Movie discovery app',
        tags: ['React', 'react', 'Render'],
        intervalMinutes: 15,
        timeoutSeconds: 20,
        slowThresholdMs: 2000,
        failureThreshold: 5,
        monitoringEnabled: false,
      });

    expect(response.status).toBe(201);
    // Tags are lowercased and de-duplicated.
    expect(response.body.data.site.tags).toEqual(['react', 'render']);
    expect(response.body.data.site.currentStatus).toBe('PAUSED');
  });

  it('starts a site created paused in the PAUSED state', async () => {
    const { cookie } = await createUser('paused@example.com');

    const site = await addSite(cookie, { monitoringEnabled: false });

    expect(site.currentStatus).toBe('PAUSED');
  });

  it('rejects an unknown field rather than silently ignoring it', async () => {
    const { cookie } = await createUser('strict@example.com');

    const response = await request(app)
      .post('/api/sites')
      .set('Cookie', cookie)
      .send({ name: 'X', url: 'https://x.example.com', userId: 'someone-elses-id' });

    expect(response.status).toBe(400);
  });

  it('rejects an interval that is not offered in the UI', async () => {
    const { cookie } = await createUser('interval@example.com');

    const response = await request(app)
      .post('/api/sites')
      .set('Cookie', cookie)
      .send({ name: 'X', url: 'https://x.example.com', intervalMinutes: 7 });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toContainEqual(
      expect.objectContaining({ field: 'intervalMinutes' }),
    );
  });
});

describe('response shape', () => {
  it('returns the same fields from create, get, and list', async () => {
    const { cookie } = await createUser('shape@example.com');
    const created = await addSite(cookie, { healthEndpoint: 'https://recallix.example.com/health' });

    const fetched = await request(app).get(`/api/sites/${created.id}`).set('Cookie', cookie);
    const listed = await request(app).get('/api/sites').set('Cookie', cookie);

    const fromGet = fetched.body.data.site;
    const fromList = listed.body.data.items[0];

    // Create returns a hydrated document and list uses .lean(), which have
    // different natural shapes. Every read path goes through one serialiser so
    // clients see a single contract.
    expect(Object.keys(created).sort()).toEqual(Object.keys(fromGet).sort());
    expect(Object.keys(fromGet).sort()).toEqual(Object.keys(fromList).sort());
  });

  it('exposes id and checkUrl, and hides Mongo internals', async () => {
    const { cookie } = await createUser('fields@example.com');
    await addSite(cookie, { healthEndpoint: 'https://recallix.example.com/health' });

    const listed = await request(app).get('/api/sites').set('Cookie', cookie);
    const site = listed.body.data.items[0];

    expect(site.id).toMatch(/^[a-f\d]{24}$/);
    expect(site.checkUrl).toBe('https://recallix.example.com/health');
    expect(site._id).toBeUndefined();
    expect(site.__v).toBeUndefined();
    // The caller already knows who they are; echoing it invites clients to
    // start passing it back.
    expect(site.userId).toBeUndefined();
  });

  it('falls back to the main URL for checkUrl when no health endpoint is set', async () => {
    const { cookie } = await createUser('checkurl@example.com');
    const site = await addSite(cookie);

    expect(site.checkUrl).toBe('https://recallix.example.com');
  });
});

describe('SSRF protection on write', () => {
  it.each([
    ['http://localhost:3000', 'localhost'],
    ['http://127.0.0.1/health', 'loopback'],
    ['http://10.0.0.1', 'private range'],
    ['http://192.168.1.1', 'private range'],
    ['http://169.254.169.254/latest/meta-data/', 'cloud metadata'],
    ['http://[::1]', 'IPv6 loopback'],
    ['file:///etc/passwd', 'file scheme'],
    ['http://db.internal', 'internal hostname'],
  ])('refuses to store %s (%s)', async (url) => {
    const { cookie } = await createUser(`ssrf-${Math.random()}@example.com`);

    const response = await request(app)
      .post('/api/sites')
      .set('Cookie', cookie)
      .send({ name: 'Bad', url });

    expect(response.status).toBe(400);
    expect(await Site.countDocuments()).toBe(0);
  });

  it('refuses a public hostname that resolves to a private address', async () => {
    const { cookie } = await createUser('rebind@example.com');
    stubDnsAddresses([{ address: '127.0.0.1', family: 4 }]);

    const response = await request(app)
      .post('/api/sites')
      .set('Cookie', cookie)
      .send({ name: 'Sneaky', url: 'https://sneaky.example.com' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('URL_NOT_ALLOWED');
  });

  it('validates the health endpoint as strictly as the main URL', async () => {
    const { cookie } = await createUser('endpoint@example.com');

    const response = await request(app).post('/api/sites').set('Cookie', cookie).send({
      name: 'Split',
      url: 'https://public.example.com',
      healthEndpoint: 'http://169.254.169.254/latest/meta-data/',
    });

    expect(response.status).toBe(400);
  });

  it('refuses to update a stored site to a blocked URL', async () => {
    const { cookie } = await createUser('update-ssrf@example.com');
    const site = await addSite(cookie);

    const response = await request(app)
      .patch(`/api/sites/${site.id}`)
      .set('Cookie', cookie)
      .send({ url: 'http://127.0.0.1' });

    expect(response.status).toBe(400);
  });
});

describe('tenant isolation', () => {
  it('lists only the requesting user’s sites', async () => {
    const alice = await createUser('alice@example.com');
    const bob = await createUser('bob@example.com');

    await addSite(alice.cookie, { name: 'Alice Site' });
    await addSite(bob.cookie, { name: 'Bob Site' });

    const response = await request(app).get('/api/sites').set('Cookie', alice.cookie);

    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].name).toBe('Alice Site');
  });

  it.each([
    ['get', 'reading'],
    ['patch', 'editing'],
    ['delete', 'deleting'],
  ])('returns 404 when %s another user’s site', async (method) => {
    const alice = await createUser(`alice-${method}@example.com`);
    const bob = await createUser(`bob-${method}@example.com`);
    const aliceSite = await addSite(alice.cookie);

    const response = await send(method as HttpMethod, `/api/sites/${aliceSite.id}`)
      .set('Cookie', bob.cookie)
      .send({ name: 'Hijacked' });

    // 404 rather than 403: a different answer would confirm the id exists.
    expect(response.status).toBe(404);
  });

  it('leaves the other user’s site untouched after a failed edit', async () => {
    const alice = await createUser('alice-safe@example.com');
    const bob = await createUser('bob-safe@example.com');
    const aliceSite = await addSite(alice.cookie, { name: 'Original' });

    await request(app)
      .patch(`/api/sites/${aliceSite.id}`)
      .set('Cookie', bob.cookie)
      .send({ name: 'Hijacked' });

    const stored = await Site.findById(aliceSite.id);
    expect(stored?.name).toBe('Original');
  });

  it('ignores a userId supplied in the body', async () => {
    const alice = await createUser('alice-spoof@example.com');
    const bob = await createUser('bob-spoof@example.com');

    const response = await request(app)
      .post('/api/sites')
      .set('Cookie', bob.cookie)
      .send({ name: 'Spoof', url: 'https://x.example.com', userId: alice.id });

    // The schema is strict, so an attempt to set the owner is rejected outright.
    expect(response.status).toBe(400);
  });
});

describe('GET /api/sites', () => {
  it('searches by name, URL, and tag', async () => {
    const { cookie } = await createUser('search@example.com');
    await addSite(cookie, { name: 'Recallix', url: 'https://recallix.example.com' });
    await addSite(cookie, { name: 'Movie Spark', url: 'https://spark.example.com', tags: ['media'] });

    const byName = await request(app).get('/api/sites?search=recall').set('Cookie', cookie);
    const byUrl = await request(app).get('/api/sites?search=spark.example').set('Cookie', cookie);
    const byTag = await request(app).get('/api/sites?search=media').set('Cookie', cookie);

    expect(byName.body.data.items).toHaveLength(1);
    expect(byName.body.data.items[0].name).toBe('Recallix');
    expect(byUrl.body.data.items[0].name).toBe('Movie Spark');
    expect(byTag.body.data.items[0].name).toBe('Movie Spark');
  });

  it('treats regex metacharacters in a search as literal text', async () => {
    const { cookie } = await createUser('regex@example.com');
    await addSite(cookie, { name: 'Recallix' });

    // Unescaped, ".*" would match everything.
    const response = await request(app).get('/api/sites?search=.*').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(0);
  });

  it('filters by status', async () => {
    const { cookie } = await createUser('filter@example.com');
    await addSite(cookie, { name: 'Live' });
    await addSite(cookie, { name: 'Paused', monitoringEnabled: false });

    const response = await request(app).get('/api/sites?status=PAUSED').set('Cookie', cookie);

    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].name).toBe('Paused');
  });

  it('sorts by name', async () => {
    const { cookie } = await createUser('sort@example.com');
    await addSite(cookie, { name: 'Zebra' });
    await addSite(cookie, { name: 'Alpha' });

    const response = await request(app)
      .get('/api/sites?sort=name&order=asc')
      .set('Cookie', cookie);

    expect(response.body.data.items.map((site: { name: string }) => site.name)).toEqual([
      'Alpha',
      'Zebra',
    ]);
  });

  it('paginates and reports the total', async () => {
    const { cookie } = await createUser('page@example.com');
    for (let index = 0; index < 3; index += 1) {
      await addSite(cookie, { name: `Site ${index}` });
    }

    const response = await request(app).get('/api/sites?limit=2&page=1').set('Cookie', cookie);

    expect(response.body.data.items).toHaveLength(2);
    expect(response.body.data.pagination).toMatchObject({
      total: 3,
      totalPages: 2,
      hasMore: true,
    });
  });
});

describe('PATCH /api/sites/:id', () => {
  it('updates editable fields', async () => {
    const { cookie } = await createUser('edit@example.com');
    const site = await addSite(cookie);

    const response = await request(app)
      .patch(`/api/sites/${site.id}`)
      .set('Cookie', cookie)
      .send({ name: 'Renamed', failureThreshold: 5 });

    expect(response.status).toBe(200);
    expect(response.body.data.site).toMatchObject({ name: 'Renamed', failureThreshold: 5 });
  });

  it('moves a site to PAUSED when monitoring is disabled', async () => {
    const { cookie } = await createUser('pause@example.com');
    const site = await addSite(cookie);

    const response = await request(app)
      .patch(`/api/sites/${site.id}`)
      .set('Cookie', cookie)
      .send({ monitoringEnabled: false });

    expect(response.body.data.site.currentStatus).toBe('PAUSED');
  });

  it('moves a paused site back to UNKNOWN when resumed', async () => {
    const { cookie } = await createUser('resume@example.com');
    const site = await addSite(cookie, { monitoringEnabled: false });

    const response = await request(app)
      .patch(`/api/sites/${site.id}`)
      .set('Cookie', cookie)
      .send({ monitoringEnabled: true });

    expect(response.body.data.site.currentStatus).toBe('UNKNOWN');
  });

  it('rejects an empty update', async () => {
    const { cookie } = await createUser('empty@example.com');
    const site = await addSite(cookie);

    const response = await request(app)
      .patch(`/api/sites/${site.id}`)
      .set('Cookie', cookie)
      .send({});

    expect(response.status).toBe(400);
  });

  it('rejects a malformed site id', async () => {
    const { cookie } = await createUser('badid@example.com');

    const response = await request(app)
      .patch('/api/sites/not-an-object-id')
      .set('Cookie', cookie)
      .send({ name: 'X' });

    expect(response.status).toBe(400);
  });
});

describe('DELETE /api/sites/:id', () => {
  it('deletes the site and everything belonging to it', async () => {
    const { cookie, id: userId } = await createUser('delete@example.com');
    const site = await addSite(cookie);

    // Without the cascade these would outlive the site and skew every
    // aggregate that counts them.
    await HealthCheck.create({ siteId: site.id, userId, success: true, statusCode: 200 });
    await Incident.create({ siteId: site.id, userId, reason: 'HTTP 503' });
    await Notification.create({
      siteId: site.id,
      userId,
      type: 'SITE_DOWN',
      title: 'Down',
      message: 'Site is down',
    });

    const response = await request(app).delete(`/api/sites/${site.id}`).set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(await Site.countDocuments()).toBe(0);
    expect(await HealthCheck.countDocuments()).toBe(0);
    expect(await Incident.countDocuments()).toBe(0);
    expect(await Notification.countDocuments()).toBe(0);
  });

  it('returns 404 for a site that does not exist', async () => {
    const { cookie } = await createUser('missing@example.com');

    const response = await request(app)
      .delete('/api/sites/507f1f77bcf86cd799439011')
      .set('Cookie', cookie);

    expect(response.status).toBe(404);
  });
});
