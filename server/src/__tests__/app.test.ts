import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../app.js';

const app = createApp();

describe('health endpoints', () => {
  it('reports liveness without requiring a database', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { status: 'ok', environment: 'test' },
    });
    expect(typeof response.body.data.uptimeSeconds).toBe('number');
  });

  it('returns an x-request-id header for tracing', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('echoes a caller-supplied request id', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('x-request-id', 'trace-me-123');

    expect(response.headers['x-request-id']).toBe('trace-me-123');
  });

  it('fails readiness while the database is disconnected', async () => {
    const response = await request(app).get('/api/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
  });
});

describe('response envelope', () => {
  it('returns the error envelope for unknown routes', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(response.body.message).toContain('/api/does-not-exist');
  });

  it('rejects malformed JSON bodies with a validation error', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('describes the API at the root path', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

describe('security headers', () => {
  it('sets helmet defaults and hides the framework', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('allows the configured client origin', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('refuses an origin that is not on the allowlist', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.example.com');

    expect(response.status).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
