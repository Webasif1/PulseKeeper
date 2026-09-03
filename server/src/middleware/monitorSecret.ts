import { timingSafeEqual } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

/** Constant-time comparison, so the secret cannot be recovered byte by byte. */
function secretsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  // timingSafeEqual throws on length mismatch, which would itself leak the
  // length. Compare lengths separately and still run the comparison.
  if (providedBuffer.length !== expectedBuffer.length) {
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Authenticate the external monitor trigger (SPEC section 41).
 *
 * This endpoint runs outbound requests, so it is authenticated by a shared
 * secret rather than a user session — the caller is a cron service, not a
 * browser. When no secret is configured the route is refused outright rather
 * than left open; the environment schema already makes the secret mandatory in
 * production.
 */
export function requireMonitorSecret(req: Request, _res: Response, next: NextFunction): void {
  if (!env.MONITOR_CRON_SECRET) {
    next(
      AppError.forbidden(
        'The monitor trigger is disabled because MONITOR_CRON_SECRET is not configured',
      ),
    );
    return;
  }

  const header = req.headers['x-monitor-secret'];
  const provided = Array.isArray(header) ? header[0] : header;

  if (!provided || !secretsMatch(provided, env.MONITOR_CRON_SECRET)) {
    next(AppError.unauthorized('Invalid monitor secret'));
    return;
  }

  next();
}
