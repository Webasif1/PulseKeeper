import type { Request, Response } from 'express';

import { getAuthUser } from '../middleware/requireAuth.js';
import { validatedBody } from '../middleware/validate.js';
import { getUserById, loginUser, registerUser } from '../services/auth.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { clearAuthCookie, setAuthCookie } from '../utils/cookies.js';
import { signAuthToken } from '../utils/jwt.js';
import { loginSchema, registerSchema } from '../validators/auth.validators.js';

/**
 * The token is returned in the body as well as the cookie. Browsers use the
 * cookie and ignore the field; scripts and API clients that cannot hold cookies
 * use the bearer token.
 */
function issueSession(res: Response, user: { id: string; email: string }): string {
  const { token, expiresAt } = signAuthToken({ userId: user.id, email: user.email });
  setAuthCookie(res, token, expiresAt);
  return token;
}

export async function register(req: Request, res: Response): Promise<void> {
  const input = validatedBody(req, registerSchema);
  const user = await registerUser(input);
  const token = issueSession(res, user);

  sendCreated(res, { user, token }, 'Account created');
}

export async function login(req: Request, res: Response): Promise<void> {
  const input = validatedBody(req, loginSchema);
  const user = await loginUser(input);
  const token = issueSession(res, user);

  sendSuccess(res, { user, token }, 'Signed in');
}

export function logout(_req: Request, res: Response): void {
  clearAuthCookie(res);
  sendSuccess(res, null, 'Signed out');
}

export async function me(req: Request, res: Response): Promise<void> {
  const { id } = getAuthUser(req);
  const user = await getUserById(id);

  sendSuccess(res, { user }, 'Current user');
}
