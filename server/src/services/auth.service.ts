import { Settings } from '../models/Settings.js';
import { User, type UserDocument } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import type { LoginInput, RegisterInput } from '../validators/auth.validators.js';

const log = createLogger('auth');

/** The user shape returned to clients. Never contains the password hash. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  createdAt: Date;
}

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user.id as string,
    name: user.name,
    email: user.email,
    ...(user.avatar ? { avatar: user.avatar } : {}),
    createdAt: user.createdAt,
  };
}

/**
 * Create an account.
 *
 * The settings document is created alongside the user so every later read of
 * `/api/settings` finds one, and no endpoint has to handle a half-initialised
 * account.
 */
export async function registerUser(input: RegisterInput): Promise<PublicUser> {
  const existing = await User.exists({ email: input.email });
  if (existing) {
    // Registration cannot avoid revealing that an address is taken — the
    // account could not otherwise be created — so the message is direct here,
    // unlike on login.
    throw AppError.conflict('An account with that email already exists');
  }

  // The pre-save hook hashes the password.
  const user = await User.create({
    name: input.name,
    email: input.email,
    password: input.password,
  });

  await Settings.create({ userId: user._id });

  log.info({ userId: user.id }, 'User registered');

  return toPublicUser(user);
}

/**
 * Verify credentials.
 *
 * Both "no such account" and "wrong password" return the same message, so the
 * endpoint cannot be used to enumerate registered addresses. The password field
 * must be selected explicitly because the schema excludes it by default.
 */
export async function loginUser(input: LoginInput): Promise<PublicUser> {
  const user = await User.findOne({ email: input.email }).select('+password');

  if (!user || !(await user.comparePassword(input.password))) {
    log.warn({ email: input.email }, 'Failed login attempt');
    throw AppError.unauthorized('Invalid email or password');
  }

  log.info({ userId: user.id }, 'User signed in');

  return toPublicUser(user);
}

export async function getUserById(userId: string): Promise<PublicUser> {
  const user = await User.findById(userId);
  if (!user) {
    throw AppError.unauthorized('Account no longer exists');
  }
  return toPublicUser(user);
}
