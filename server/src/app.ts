import cookieParser from 'cookie-parser';
import cors, { type CorsOptions } from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { requestLogger } from './middleware/requestLogger.js';
import routes from './routes/index.js';
import { AppError } from './utils/AppError.js';

/**
 * CORS policy.
 *
 * An explicit allowlist rather than a reflected origin: credentials are sent as
 * cookies, so reflecting arbitrary origins would let any site drive the API as
 * the signed-in user. Requests without an Origin header (server-to-server, curl,
 * external cron) are allowed through — they carry no ambient cookie authority.
 */
function buildCorsOptions(): CorsOptions {
  return {
    origin(origin, callback) {
      if (!origin || env.allowedOrigins.includes(origin.replace(/\/$/, ''))) {
        callback(null, true);
        return;
      }
      callback(AppError.forbidden(`Origin ${origin} is not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-monitor-secret', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
    maxAge: 86_400,
  };
}

/**
 * Build the Express application.
 *
 * Separate from `server.ts` so tests can exercise the app without opening a
 * port, connecting to MongoDB, or starting the cron scheduler.
 */
export function createApp(): Express {
  const app = express();

  // Behind Render/Railway/nginx the client IP arrives in X-Forwarded-For; rate
  // limiting is worthless without this, and trusting it blindly lets clients
  // spoof their address, so it comes from configuration.
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON only; the dashboard is a separate origin.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cors(buildCorsOptions()));

  // 100kb is far above any legitimate request here and well below a payload
  // worth parsing from an attacker.
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));
  app.use(cookieParser());

  app.use(requestLogger);

  app.use('/api', apiLimiter);
  app.use('/api', routes);

  app.get('/', (_req, res) => {
    res.json({
      success: true,
      message: 'PulseKeeper API',
      data: { docs: 'https://github.com/Webasif1/PulseKeeper#readme', health: '/api/health' },
    });
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
