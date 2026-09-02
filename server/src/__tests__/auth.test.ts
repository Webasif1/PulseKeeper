import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { Settings } from '../models/Settings.js';
import { User } from '../models/User.js';
import { clearTestDb, connectTestDb, disconnectTestDb } from './helpers/db.js';

const app = createApp();

const validUser = {
  name: 'Asif Rahman',
  email: 'asif@example.com',
  password: 'correct-horse-battery',
};

/** Register a user and return the auth cookie the response set. */
async function registerAndGetCookie(): Promise<string> {
  const response = await request(app).post('/api/auth/register').send(validUser);
  const cookies = response.headers['set-cookie'] as unknown as string[];
  return cookies[0] ?? '';
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

describe('POST /api/auth/register', () => {
  it('creates an account and issues an httpOnly cookie', async () => {
    const response = await request(app).post('/api/auth/register').send(validUser);

    expect(response.status).toBe(201);
    expect(response.body.data.user).toMatchObject({
      name: validUser.name,
      email: validUser.email,
    });

    const cookie = (response.headers['set-cookie'] as unknown as string[])[0] ?? '';
    expect(cookie).toContain('pk_token=');
    expect(cookie).toContain('HttpOnly');
  });

  it('never returns the password hash', async () => {
    const response = await request(app).post('/api/auth/register').send(validUser);

    expect(JSON.stringify(response.body)).not.toContain('password');
    expect(response.body.data.user.password).toBeUndefined();
  });

  it('stores the password as a bcrypt hash, not plaintext', async () => {
    await request(app).post('/api/auth/register').send(validUser);

    const stored = await User.findOne({ email: validUser.email }).select('+password');
    expect(stored?.password).toBeDefined();
    expect(stored?.password).not.toBe(validUser.password);
    expect(stored?.password).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it('creates a settings document alongside the account', async () => {
    const response = await request(app).post('/api/auth/register').send(validUser);

    const settings = await Settings.findOne({ userId: response.body.data.user.id });
    expect(settings).not.toBeNull();
    expect(settings?.defaultIntervalMinutes).toBe(5);
    expect(settings?.dataRetentionDays).toBe(30);
  });

  it('normalises the email to lowercase', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'ASIF@Example.COM' });

    expect(response.body.data.user.email).toBe('asif@example.com');
  });

  it('rejects a duplicate email', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const response = await request(app).post('/api/auth/register').send(validUser);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('rejects a short password with a field-level message', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, password: 'short' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toContainEqual(
      expect.objectContaining({ field: 'password' }),
    );
  });

  it('rejects an invalid email', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'not-an-email' });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toContainEqual(
      expect.objectContaining({ field: 'email' }),
    );
  });

  it('rejects a password longer than bcrypt can use', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, password: 'a'.repeat(73) });

    expect(response.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(validUser);
  });

  it('signs in with correct credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe(validUser.email);
    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'not-the-password' });

    const unknownAccount = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'not-the-password' });

    // Identical responses, so the endpoint cannot be used to discover which
    // email addresses are registered.
    expect(wrongPassword.status).toBe(401);
    expect(unknownAccount.status).toBe(401);
    expect(wrongPassword.body.message).toBe(unknownAccount.body.message);
    expect(wrongPassword.body.message).toBe('Invalid email or password');
  });

  it('accepts a differently-cased email', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ASIF@EXAMPLE.COM', password: validUser.password });

    expect(response.status).toBe(200);
  });
});

describe('GET /api/auth/me', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns the signed-in user from the cookie', async () => {
    const cookie = await registerAndGetCookie();

    const response = await request(app).get('/api/auth/me').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe(validUser.email);
  });

  it('accepts a bearer token for non-browser clients', async () => {
    const registered = await request(app).post('/api/auth/register').send(validUser);
    const { token } = registered.body.data;

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe(validUser.email);
  });

  it('rejects a tampered token', async () => {
    const registered = await request(app).post('/api/auth/register').send(validUser);
    const tampered = `${registered.body.data.token.slice(0, -4)}aaaa`;

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tampered}`);

    expect(response.status).toBe(401);
  });

  it('rejects a valid token whose account has been deleted', async () => {
    const registered = await request(app).post('/api/auth/register').send(validUser);
    await User.deleteOne({ email: validUser.email });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${registered.body.data.token}`);

    // The token is still cryptographically valid; the user lookup is what
    // stops it, which is why requireAuth reads the account on every request.
    expect(response.status).toBe(401);
    expect(response.body.message).toContain('no longer exists');
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the auth cookie', async () => {
    const cookie = await registerAndGetCookie();

    const response = await request(app).post('/api/auth/logout').set('Cookie', cookie);

    expect(response.status).toBe(200);
    const cleared = (response.headers['set-cookie'] as unknown as string[])[0] ?? '';
    expect(cleared).toContain('pk_token=;');
  });
});
