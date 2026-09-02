import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../utils/AppError.js';

/**
 * Catch-all for unmatched routes.
 *
 * Registered after every router so unknown paths produce the standard error
 * envelope rather than Express's HTML default.
 */
export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}
