import type { Request, Response } from 'express';

import { getDatabaseState, isDatabaseConnected } from '../config/db.js';
import { env } from '../config/env.js';
import { sendError, sendSuccess } from '../utils/apiResponse.js';
import { ErrorCode } from '../utils/AppError.js';

const APP_VERSION = process.env.npm_package_version ?? '0.1.0';
const startedAt = Date.now();

/**
 * Liveness probe. Answers "is the process running", so it stays 200 even while
 * the database is unreachable — a platform health check should not recycle the
 * container for a transient MongoDB blip.
 */
export function getHealth(_req: Request, res: Response): void {
  sendSuccess(
    res,
    {
      status: 'ok',
      version: APP_VERSION,
      environment: env.NODE_ENV,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      database: getDatabaseState(),
    },
    'Service is running',
  );
}

/**
 * Readiness probe. Answers "can this instance serve traffic", so a missing
 * database connection is a 503 and load balancers route around it.
 */
export function getReadiness(_req: Request, res: Response): void {
  const databaseState = getDatabaseState();

  if (!isDatabaseConnected()) {
    sendError(
      res,
      503,
      'Service is not ready: database unavailable',
      ErrorCode.SERVICE_UNAVAILABLE,
      { database: databaseState },
    );
    return;
  }

  sendSuccess(res, { status: 'ready', database: databaseState }, 'Service is ready');
}
