/**
 * Machine-readable error codes returned in the `error.code` field.
 *
 * Clients switch on these rather than on message text, so they are part of the
 * public API contract: add freely, rename with care.
 */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  URL_NOT_ALLOWED: 'URL_NOT_ALLOWED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * An error the application raised deliberately.
 *
 * `isOperational` separates expected failures (bad input, missing document,
 * rate limit) from genuine bugs. Operational errors are safe to describe to the
 * client; anything else is reported as a generic internal error.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCodeValue;
  readonly details?: unknown;
  readonly isOperational = true;

  constructor(
    statusCode: number,
    message: string,
    code: ErrorCodeValue = ErrorCode.INTERNAL_ERROR,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, AppError);
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, message, ErrorCode.VALIDATION_ERROR, details);
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError(401, message, ErrorCode.UNAUTHORIZED);
  }

  static forbidden(message = 'You do not have access to this resource'): AppError {
    return new AppError(403, message, ErrorCode.FORBIDDEN);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(404, message, ErrorCode.NOT_FOUND);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError(409, message, ErrorCode.CONFLICT, details);
  }

  static tooManyRequests(message = 'Too many requests, please slow down'): AppError {
    return new AppError(429, message, ErrorCode.RATE_LIMITED);
  }

  static urlNotAllowed(message: string, details?: unknown): AppError {
    return new AppError(400, message, ErrorCode.URL_NOT_ALLOWED, details);
  }

  static internal(message = 'Something went wrong'): AppError {
    return new AppError(500, message, ErrorCode.INTERNAL_ERROR);
  }

  static serviceUnavailable(message = 'Service temporarily unavailable'): AppError {
    return new AppError(503, message, ErrorCode.SERVICE_UNAVAILABLE);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
