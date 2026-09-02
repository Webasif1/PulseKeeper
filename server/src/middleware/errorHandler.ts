import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';

import { env } from '../config/env.js';
import { AppError, ErrorCode, type ErrorCodeValue } from '../utils/AppError.js';
import { sendError } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';

interface NormalizedError {
  statusCode: number;
  message: string;
  code: ErrorCodeValue | string;
  details?: unknown;
  /** Expected failures are logged as warnings; everything else as errors. */
  operational: boolean;
}

/** Field-level issues from a Zod failure, in a shape the client can render. */
function formatZodIssues(error: ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

function normalize(error: unknown): NormalizedError {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      message: error.message,
      code: error.code,
      details: error.details,
      operational: true,
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      message: 'Request validation failed',
      code: ErrorCode.VALIDATION_ERROR,
      details: formatZodIssues(error),
      operational: true,
    };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return {
      statusCode: 400,
      message: 'Request validation failed',
      code: ErrorCode.VALIDATION_ERROR,
      details: Object.values(error.errors).map((issue) => ({
        field: issue.path,
        message: issue.message,
      })),
      operational: true,
    };
  }

  if (error instanceof mongoose.Error.CastError) {
    // Almost always a malformed ObjectId in the URL.
    return {
      statusCode: 400,
      message: `Invalid value for '${error.path}'`,
      code: ErrorCode.VALIDATION_ERROR,
      operational: true,
    };
  }

  // Duplicate key violation on a unique index, e.g. registering an existing email.
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  ) {
    const keys = Object.keys((error as { keyPattern?: Record<string, unknown> }).keyPattern ?? {});
    const field = keys[0] ?? 'value';
    return {
      statusCode: 409,
      message: `That ${field} is already in use`,
      code: ErrorCode.CONFLICT,
      operational: true,
    };
  }

  if (error instanceof SyntaxError && 'body' in error) {
    return {
      statusCode: 400,
      message: 'Request body is not valid JSON',
      code: ErrorCode.VALIDATION_ERROR,
      operational: true,
    };
  }

  return {
    statusCode: 500,
    message: 'Something went wrong',
    code: ErrorCode.INTERNAL_ERROR,
    operational: false,
  };
}

/**
 * Terminal error middleware.
 *
 * Unexpected errors are logged in full but reported to the client as a generic
 * internal error, so stack traces and driver messages never leak. In
 * development the original message is attached as `details` to keep debugging
 * practical.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const normalized = normalize(error);

  const log = req.log ?? logger;
  const context = {
    err: error,
    statusCode: normalized.statusCode,
    method: req.method,
    path: req.originalUrl,
  };

  if (normalized.operational) {
    log.warn(context, normalized.message);
  } else {
    log.error(context, 'Unhandled error');
  }

  let details = normalized.details;
  if (!normalized.operational && !env.isProduction && error instanceof Error) {
    details = { originalMessage: error.message, stack: error.stack };
  }

  // Headers already sent means the response streamed before failing; the only
  // correct move is to abort the connection.
  if (res.headersSent) {
    res.destroy();
    return;
  }

  sendError(res, normalized.statusCode, normalized.message, normalized.code, details);
}
