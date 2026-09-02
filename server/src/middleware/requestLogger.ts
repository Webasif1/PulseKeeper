import { randomUUID } from 'node:crypto';

import type { IncomingMessage, ServerResponse } from 'node:http';
import { pinoHttp } from 'pino-http';

import { logger } from '../utils/logger.js';

/**
 * Per-request logging.
 *
 * Every request gets an id that is echoed in the `x-request-id` response header
 * and attached to each log line it produces, so a report from a user can be
 * traced through the logs. Health checks are logged at debug level: an uptime
 * probe hitting them every few seconds would otherwise bury real traffic.
 */
export const requestLogger = pinoHttp({
  logger,

  genReqId(req: IncomingMessage, res: ServerResponse) {
    const existing = req.headers['x-request-id'];
    const id = (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },

  customLogLevel(req: IncomingMessage, res: ServerResponse, err?: Error) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    if (req.url?.startsWith('/api/health')) return 'debug';
    return 'info';
  },

  customSuccessMessage(req: IncomingMessage, res: ServerResponse) {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },

  customErrorMessage(req: IncomingMessage, res: ServerResponse, err: Error) {
    return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
  },

  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
});
