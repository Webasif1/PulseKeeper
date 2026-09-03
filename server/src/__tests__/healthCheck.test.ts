import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as UrlGuard from '../utils/urlGuard.js';

/**
 * The guard is mocked so these tests can run against a loopback server.
 *
 * This is a mock in the test file, not a flag in the application: production
 * code has no way to skip the guard. The final test in this file leaves the
 * real guard in place and asserts that a loopback URL is refused, so the
 * mocking here cannot hide a missing check.
 */
vi.mock('../utils/urlGuard.js', async () => {
  const dns = await import('node:dns');

  return {
    assertUrlAllowed: async (raw: string) => ({ url: new URL(raw), addresses: ['127.0.0.1'] }),
    assertRedirectAllowed: async (location: string, current: URL) => ({
      url: new URL(location, current),
      addresses: ['127.0.0.1'],
    }),
    createGuardedLookup: () => dns.default.lookup,
    parseAllowedUrl: (raw: string) => new URL(raw),
    assertAddressAllowed: () => undefined,
  };
});

const { classifyHttpStatus, decideStatus, runHealthCheck } = await import(
  '../services/healthCheck.service.js'
);

/** A configurable local server, so every case is deterministic and offline. */
let server: http.Server;
let baseUrl: string;
let handler: (req: http.IncomingMessage, res: http.ServerResponse) => void;

beforeAll(async () => {
  server = http.createServer((req, res) => handler(req, res));

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const defaultOptions = { timeoutSeconds: 5, slowThresholdMs: 3000 };

describe('decideStatus', () => {
  it('is ONLINE for a fast success', () => {
    expect(decideStatus(true, 120, 3000)).toBe('ONLINE');
  });

  it('is SLOW when the response exceeds the threshold', () => {
    expect(decideStatus(true, 3200, 3000)).toBe('SLOW');
  });

  it('treats the threshold itself as still online', () => {
    // "Slow" means over the threshold, not at it.
    expect(decideStatus(true, 3000, 3000)).toBe('ONLINE');
  });

  it('is OFFLINE for any failure, however fast', () => {
    expect(decideStatus(false, 10, 3000)).toBe('OFFLINE');
  });
});

describe('classifyHttpStatus', () => {
  it.each([200, 201, 204, 301, 302, 399])('treats %i as healthy', (code) => {
    expect(classifyHttpStatus(code).success).toBe(true);
  });

  it.each([400, 404, 429, 499])('treats %i as an HTTP error', (code) => {
    expect(classifyHttpStatus(code)).toMatchObject({ success: false, errorType: 'HTTP_ERROR' });
  });

  it.each([500, 502, 503])('treats %i as a server error', (code) => {
    expect(classifyHttpStatus(code)).toMatchObject({ success: false, errorType: 'SERVER_ERROR' });
  });
});

describe('runHealthCheck', () => {
  it('reports a healthy site as ONLINE with a response time', async () => {
    handler = (_req, res) => {
      res.writeHead(200);
      res.end('ok');
    };

    const result = await runHealthCheck(baseUrl, defaultOptions);

    expect(result).toMatchObject({ success: true, status: 'ONLINE', statusCode: 200 });
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('reports SLOW when the response is over the threshold', async () => {
    handler = (_req, res) => {
      setTimeout(() => {
        res.writeHead(200);
        res.end('ok');
      }, 120);
    };

    const result = await runHealthCheck(baseUrl, {
      timeoutSeconds: 5,
      slowThresholdMs: 50,
    });

    expect(result.status).toBe('SLOW');
    expect(result.success).toBe(true);
  });

  it('reports a 500 as OFFLINE with SERVER_ERROR', async () => {
    handler = (_req, res) => {
      res.writeHead(503);
      res.end();
    };

    const result = await runHealthCheck(baseUrl, defaultOptions);

    expect(result).toMatchObject({
      success: false,
      status: 'OFFLINE',
      statusCode: 503,
      errorType: 'SERVER_ERROR',
    });
  });

  it('reports a 404 as OFFLINE with HTTP_ERROR', async () => {
    handler = (_req, res) => {
      res.writeHead(404);
      res.end();
    };

    const result = await runHealthCheck(baseUrl, defaultOptions);

    expect(result).toMatchObject({ status: 'OFFLINE', errorType: 'HTTP_ERROR' });
  });

  it('times out rather than waiting indefinitely', async () => {
    handler = () => {
      // Never responds.
    };

    const result = await runHealthCheck(baseUrl, {
      timeoutSeconds: 1,
      slowThresholdMs: 3000,
    });

    expect(result).toMatchObject({
      success: false,
      status: 'OFFLINE',
      errorType: 'TIMEOUT',
    });
    expect(result.errorMessage).toContain('1s');
  });

  it('reports a refused connection as CONNECTION_ERROR', async () => {
    // Port 1 on loopback: nothing is listening.
    const result = await runHealthCheck('http://127.0.0.1:1', defaultOptions);

    expect(result).toMatchObject({ success: false, errorType: 'CONNECTION_ERROR' });
  });

  it('follows a redirect and reports the final status', async () => {
    handler = (req, res) => {
      if (req.url === '/') {
        res.writeHead(302, { location: '/final' });
        res.end();
        return;
      }
      res.writeHead(200);
      res.end('arrived');
    };

    const result = await runHealthCheck(baseUrl, defaultOptions);

    expect(result).toMatchObject({ success: true, statusCode: 200, redirects: 1 });
    expect(result.finalUrl).toContain('/final');
  });

  it('gives up on a redirect loop instead of following forever', async () => {
    handler = (_req, res) => {
      res.writeHead(302, { location: '/loop' });
      res.end();
    };

    const result = await runHealthCheck(baseUrl, { ...defaultOptions, maxRedirects: 2 });

    expect(result).toMatchObject({ success: false, errorType: 'HTTP_ERROR' });
    expect(result.errorMessage).toContain('Too many redirects');
  });

  it('sums response time across redirect hops', async () => {
    handler = (req, res) => {
      if (req.url === '/') {
        setTimeout(() => {
          res.writeHead(302, { location: '/slow-final' });
          res.end();
        }, 40);
        return;
      }
      setTimeout(() => {
        res.writeHead(200);
        res.end();
      }, 40);
    };

    const result = await runHealthCheck(baseUrl, defaultOptions);

    // Reporting only the last hop would hide the true cost of reaching the site.
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(70);
  });
});

describe('the real guard is still in force', () => {
  it('refuses a loopback URL when the guard is not mocked', async () => {
    // Everything above mocks the guard so a local server can be reached. This
    // test reaches past the mock to the real implementation, so a regression
    // that removed the check could not pass unnoticed.
    const realGuard = await vi.importActual<typeof UrlGuard>('../utils/urlGuard.js');

    await expect(realGuard.assertUrlAllowed('http://127.0.0.1:8080')).rejects.toThrow(
      /private, loopback, or otherwise reserved/,
    );
  });
});
