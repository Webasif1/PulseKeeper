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

    /** Cron expression for the monitoring sweep. Every minute by default: the
     *  sweep itself decides which sites are actually due. */
    MONITOR_CRON: z.string().min(1).default('* * * * *'),

    /** Cron expression for the retention cleanup. */
    CLEANUP_CRON: z.string().min(1).default('15 3 * * *'),

    /**
     * How many sites are checked at once. Bounded so a large account cannot
     * open hundreds of sockets at the same moment.
     */
    MONITOR_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),

    /** Redirect hops followed per check. Each hop is revalidated by the guard. */
    MONITOR_MAX_REDIRECTS: z.coerce.number().int().min(0).max(10).default(3),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    /**
     * SMTP, for email notification channels.
     *
     * All optional. Email channels are simply unavailable when SMTP is not
     * configured, which is the right default for a self-hosted tool that many
     * people will run without a mail relay.
     */
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM: z.string().min(1).optional(),
    SMTP_SECURE: booleanFromString.default('false'),

    /**
     * Public URL of the dashboard, used to build links inside outbound
     * notifications. Falls back to the first allowed origin.
     */
    DASHBOARD_URL: z.string().optional(),

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

  /** Email channels are offered only when there is a relay to send through. */
  isSmtpConfigured: Boolean(parsed.SMTP_HOST && parsed.SMTP_FROM),

  /** Where notification links point. */
  dashboardUrl:
    parsed.DASHBOARD_URL?.replace(/\/$/, '') ??
    parsed.CLIENT_URL.split(',')[0]?.trim().replace(/\/$/, '') ??
    '',
} as const;

export type Env = typeof env;
