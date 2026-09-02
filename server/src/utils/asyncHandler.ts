import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wrap an async route handler so a rejected promise reaches the error
 * middleware instead of becoming an unhandled rejection.
 *
 * Express 5 forwards rejections from async handlers on its own, but wrapping
 * keeps the behaviour explicit and independent of that version detail.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
