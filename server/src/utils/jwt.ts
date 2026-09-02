import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';

import { env } from '../config/env.js';
import { AppError } from './AppError.js';

const ISSUER = 'pulsekeeper';
const AUDIENCE = 'pulsekeeper-dashboard';

export interface AuthTokenPayload extends JwtPayload {
  /** User id. */
  sub: string;
  email: string;
}

export interface IssuedToken {
  token: string;
  /** Expiry as a Date, taken from the signed token so the cookie cannot drift. */
  expiresAt: Date;
}

/**
 * Sign an authentication token.
 *
 * Issuer and audience are pinned and verified, so a token minted by another
 * service that happens to share the secret is still rejected.
 */
export function signAuthToken(payload: { userId: string; email: string }): IssuedToken {
  const options: SignOptions = {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: ISSUER,
    audience: AUDIENCE,
    subject: payload.userId,
  };

  const token = jwt.sign({ email: payload.email }, env.JWT_SECRET, options);

  // Read the expiry back off the token rather than re-parsing JWT_EXPIRES_IN,
  // so the cookie lifetime and the token lifetime can never disagree.
  const decoded = jwt.decode(token) as JwtPayload | null;
  const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 86_400_000);

  return { token, expiresAt };
}

/**
 * Verify a token. Throws a 401 AppError for anything invalid — expired,
 * tampered, wrong algorithm, wrong issuer, or wrong audience.
 */
export function verifyAuthToken(token: string): AuthTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      // Pinning the algorithm blocks the "alg: none" and HS/RS confusion classes
      // of attack outright.
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    if (typeof decoded === 'string' || !decoded.sub) {
      throw AppError.unauthorized('Invalid authentication token');
    }

    return decoded as AuthTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Your session has expired, please sign in again');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw AppError.unauthorized('Invalid authentication token');
    }
    throw error;
  }
}
