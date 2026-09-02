import { z } from 'zod';

/**
 * Password policy.
 *
 * Length carries most of the strength, so the floor is 8 with a generous
 * ceiling rather than a maze of character-class rules. The 72-byte cap is a
 * bcrypt property: input beyond that is silently ignored by the algorithm, and
 * accepting it would make part of a user's password meaningless.
 */
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .refine((value) => !/^\s|\s$/.test(value), 'Password cannot start or end with a space');

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(254, 'Email is too long');

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(60, 'Name must be at most 60 characters'),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  // Deliberately not the full policy: an existing password predates any future
  // policy change, and echoing rules here would leak them to an attacker.
  password: z.string().min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
