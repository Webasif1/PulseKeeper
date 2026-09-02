import { pino } from 'pino';

import { env } from '../config/env.js';

/**
 * Shared application logger.
 *
 * Pretty-printed while developing, newline-delimited JSON everywhere else so
 * hosting platforms can parse it. `console.log` is banned by lint: everything
 * goes through here, which keeps redaction in one place.
 */
export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  base: { service: 'pulsekeeper-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.jwt',
      'password',
      'token',
      'MONGODB_URI',
      'JWT_SECRET',
      'MONITOR_CRON_SECRET',
    ],
    censor: '[redacted]',
  },
  ...(env.isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname,service',
          },
        },
      }
    : {}),
});

/** Child logger tagged with a subsystem name, e.g. `monitor` or `cleanup`. */
export function createLogger(name: string) {
  return logger.child({ module: name });
}
