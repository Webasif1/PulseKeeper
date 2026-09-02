import rateLimit, { type Options } from 'express-rate-limit';

import { env } from '../config/env.js';
import { ErrorCode } from '../utils/AppError.js';
import { sendError } from '../utils/apiResponse.js';

/**
 * Rate limiters.
 *
 * All of them respond with the shared error envelope so a throttled client
 * parses the response exactly like any other failure. Limits are disabled under
 * NODE_ENV=test, where the suite deliberately fires many requests at once.
 */
function createLimiter(options: Partial<Options> & { limit: number; windowMs: number }) {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.isTest,
    handler: (_req, res) => {
      sendError(
        res,
        429,
        options.message?.toString() ?? 'Too many requests, please slow down',
        ErrorCode.RATE_LIMITED,
      );
    },
    ...options,
  });
}

/** Broad ceiling applied to the whole API. */
export const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  message: 'Too many requests from this address, please try again shortly',
});

/**
 * Authentication routes. Deliberately strict: these are the endpoints worth
 * brute-forcing. Successful requests are not counted, so a legitimate user
 * signing in repeatedly is unaffected.
 */
export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: 'Too many authentication attempts, please try again in 15 minutes',
});

/**
 * Manual "Check Now". The backend makes an outbound request per call, so this
 * caps both user impatience and any attempt to use the API as a traffic source.
 */
export const manualCheckLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 10,
  message: 'Too many manual checks, please wait a moment before checking again',
});

/** Account creation, to slow down bulk signup. */
export const registerLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: 'Too many accounts created from this address, please try again later',
});
