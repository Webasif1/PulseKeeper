import type { CookieOptions, Response } from 'express';

import { env } from '../config/env.js';

export const AUTH_COOKIE_NAME = 'pk_token';

/**
 * Cookie policy for the authentication token.
 *
 * - `httpOnly` keeps the token out of reach of any script on the page, so an
 *   XSS bug cannot exfiltrate a session.
 * - In production the dashboard (Vercel) and API (Render) sit on different
 *   sites, so the cookie must be `SameSite=None`, which browsers only accept
 *   together with `Secure`. Locally both are on localhost, where `Lax` works
 *   and `Secure` would prevent the cookie from being stored over plain HTTP.
 */
function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? 'none' : 'lax',
    path: '/',
  };
}

export function setAuthCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(AUTH_COOKIE_NAME, token, { ...baseOptions(), expires: expiresAt });
}

export function clearAuthCookie(res: Response): void {
  // Attributes must match those used when setting the cookie, or the browser
  // treats it as a different cookie and leaves the original in place.
  res.clearCookie(AUTH_COOKIE_NAME, baseOptions());
}
