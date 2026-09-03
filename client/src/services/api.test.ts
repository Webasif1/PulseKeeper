import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, get, SESSION_EXPIRED_EVENT, type ApiError } from './api';

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(api);
});

afterEach(() => {
  mock.restore();
  vi.restoreAllMocks();
});

describe('response unwrapping', () => {
  it('returns data directly, not the envelope', async () => {
    mock.onGet('/api/sites').reply(200, {
      success: true,
      message: 'Sites',
      data: { items: [{ id: '1' }] },
    });

    // Callers should never write `response.data.data`.
    await expect(get('/api/sites')).resolves.toEqual({ items: [{ id: '1' }] });
  });
});

describe('error mapping', () => {
  it('turns an error envelope into an ApiError', async () => {
    mock.onGet('/api/sites/1').reply(404, {
      success: false,
      message: 'Site not found',
      error: { code: 'NOT_FOUND' },
    });

    await expect(get('/api/sites/1')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Site not found',
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('extracts field errors so a form can show them per input', async () => {
    mock.onPost('/api/sites').reply(400, {
      success: false,
      message: 'Request validation failed',
      error: {
        code: 'VALIDATION_ERROR',
        details: [{ field: 'url', message: 'Only http:// and https:// URLs can be monitored' }],
      },
    });

    try {
      await api.post('/api/sites', {});
      expect.unreachable('should have thrown');
    } catch (error) {
      const apiError = error as ApiError;
      expect(apiError.isValidationError).toBe(true);
      expect(apiError.fieldErrors).toEqual([
        { field: 'url', message: 'Only http:// and https:// URLs can be monitored' },
      ]);
    }
  });

  it('treats a blocked URL as a validation error, since it belongs on the field', async () => {
    mock.onPost('/api/sites').reply(400, {
      success: false,
      message: 'That address is not allowed',
      error: { code: 'URL_NOT_ALLOWED' },
    });

    try {
      await api.post('/api/sites', {});
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ApiError).isValidationError).toBe(true);
    }
  });

  it('explains an unreachable server instead of surfacing a raw axios message', async () => {
    mock.onGet('/api/sites').networkError();

    await expect(get('/api/sites')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });
  });

  it('ignores malformed details rather than crashing', async () => {
    mock.onPost('/api/sites').reply(400, {
      success: false,
      message: 'Bad',
      error: { code: 'VALIDATION_ERROR', details: 'not an array' },
    });

    try {
      await api.post('/api/sites', {});
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ApiError).fieldErrors).toEqual([]);
    }
  });
});

describe('session expiry', () => {
  it('announces a 401 on a normal request', async () => {
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);

    mock.onGet('/api/sites').reply(401, {
      success: false,
      message: 'Authentication required',
      error: { code: 'UNAUTHORIZED' },
    });

    await expect(get('/api/sites')).rejects.toThrow();
    expect(listener).toHaveBeenCalledOnce();

    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });

  it('stays quiet for a 401 from the session probe', async () => {
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);

    mock.onGet('/api/auth/me').reply(401, {
      success: false,
      message: 'Authentication required',
      error: { code: 'UNAUTHORIZED' },
    });

    await expect(get('/api/auth/me')).rejects.toThrow();
    // A 401 here means "not signed in", which is the answer to the question
    // asked — not a session that just expired mid-use.
    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });

  it('stays quiet for a failed sign-in', async () => {
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);

    mock.onPost('/api/auth/login').reply(401, {
      success: false,
      message: 'Invalid email or password',
      error: { code: 'UNAUTHORIZED' },
    });

    await expect(api.post('/api/auth/login', {})).rejects.toThrow();
    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });
});

describe('credentials', () => {
  it('sends the auth cookie with every request', () => {
    // Without this the HTTP-only cookie never reaches the API and every
    // request is anonymous.
    expect(api.defaults.withCredentials).toBe(true);
  });
});
