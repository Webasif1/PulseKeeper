import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

/**
 * Environment schema.
 *
 * Parsed once at import time so a misconfigured deployment fails immediately at
 * boot with a readable message, rather than at the first request that happens to
 * touch the missing value.
 */
const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    // 5050 rather than the usual 5000: Windows reserves 5000 in its Hyper-V
    // excluded port range, and macOS binds it to the AirPlay receiver.
    PORT: z.coerce.number().int().positive().max(65535).default(5050),

    MONGODB_URI: z
      .string()
      .min(1, 'MONGODB_URI is required')
      .refine(
        (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
        'MONGODB_URI must start with mongodb:// or mongodb+srv://',
      ),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

    JWT_EXPIRES_IN: z.string().min(1).default('7d'),

    /** Comma-separated list of allowed browser origins. */
    CLIENT_URL: z.string().min(1).default('http://localhost:5173'),

    MONITOR_CRON_SECRET: z
      .string()
      .min(16, 'MONITOR_CRON_SECRET must be at least 16 characters')
      .optional()
      .or(z.literal('').transform(() => undefined)),

    MONITOR_ENABLED: booleanFromString.default('true'),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    /** Express `trust proxy` value: a hop count, or false when not proxied. */
    TRUST_PROXY: z
      .string()
      .default('0')
      .transform((value) => {
        if (value === 'false') return false;
        if (value === 'true') return true;
        const hops = Number(value);
        return Number.isFinite(hops) ? hops : false;
      }),
  })
  .superRefine((env, ctx) => {
    // In production the monitor trigger must be protected; without a secret the
    // route would either be open or silently unusable.
    if (env.NODE_ENV === 'production' && !env.MONITOR_CRON_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MONITOR_CRON_SECRET'],
        message: 'MONITOR_CRON_SECRET is required when NODE_ENV=production',
      });
    }

    if (env.NODE_ENV === 'production' && env.JWT_SECRET.includes('change-me')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET still holds the example value from .env.example',
      });
    }
  });

type RawEnv = z.infer<typeof envSchema>;

function parseEnv(): RawEnv {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    // The logger depends on this module, so plain stderr is the only option here.
    console.error(
      `\nInvalid environment configuration:\n${details}\n\n` +
        'Copy server/.env.example to server/.env and fill in the missing values.\n',
    );
    process.exit(1);
  }

  return result.data;
}

const parsed = parseEnv();

export const env = {
  ...parsed,
  /** Origins allowed by CORS, derived from the comma-separated CLIENT_URL. */
  allowedOrigins: parsed.CLIENT_URL.split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),
  isProduction: parsed.NODE_ENV === 'production',
  isDevelopment: parsed.NODE_ENV === 'development',
  isTest: parsed.NODE_ENV === 'test',
} as const;

export type Env = typeof env;
