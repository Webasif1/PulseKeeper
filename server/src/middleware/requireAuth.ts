import type { NextFunction, Request, Response } from 'express';

import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { AUTH_COOKIE_NAME } from '../utils/cookies.js';
import { verifyAuthToken } from '../utils/jwt.js';

/**
 * Extract the token from the HTTP-only cookie, falling back to a bearer header.
 *
 * The cookie is how the dashboard authenticates. The header exists for scripts
 * and API clients that cannot hold cookies.
 */
function extractToken(req: Request): string | undefined {
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[AUTH_COOKIE_NAME];
  if (cookieToken) return cookieToken;

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || undefined;

  return undefined;
}

/**
 * Require an authenticated user.
 *
 * The user is re-read from the database on every request rather than trusted
 * from the token body, so a deleted account stops working immediately instead
 * of at token expiry.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) {
      throw AppError.unauthorized('Authentication required');
    }

    const payload = verifyAuthToken(token);

    const user = await User.findById(payload.sub).select('_id email name').lean();
    if (!user) {
      throw AppError.unauthorized('Account no longer exists');
    }

    req.user = {
      id: user._id.toString(),
      objectId: user._id,
      email: user.email,
      name: user.name,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Read the authenticated user, or throw.
 *
 * Controllers behind `requireAuth` use this instead of `req.user!`, so a route
 * that forgets the middleware fails loudly rather than dereferencing undefined.
 */
export function getAuthUser(req: Request): NonNullable<Request['user']> {
  if (!req.user) {
    throw AppError.unauthorized('Authentication required');
  }
  return req.user;
}
