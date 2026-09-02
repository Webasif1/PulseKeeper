import type { Server } from 'node:http';

import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

let server: Server | undefined;
let shuttingDown = false;

/**
 * Stop accepting new connections, finish in-flight requests, then close the
 * database. A hard timeout guards against a request that never completes
 * holding the process open forever.
 */
async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'Shutting down');

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out after 10s, forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
      logger.info('HTTP server closed');
    }
    await disconnectDatabase();
    clearTimeout(forceExit);
    process.exit(exitCode);
  } catch (error) {
    logger.error({ err: error }, 'Error during shutdown');
    process.exit(1);
  }
}

async function bootstrap(): Promise<void> {
  // Connect first: the process should never accept traffic it cannot serve.
  await connectDatabase();

  const app = createApp();

  server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, environment: env.NODE_ENV, allowedOrigins: env.allowedOrigins },
      `PulseKeeper API listening on http://localhost:${env.PORT}`,
    );
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.fatal({ port: env.PORT }, 'Port is already in use');
    } else {
      logger.fatal({ err: error }, 'HTTP server error');
    }
    process.exit(1);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// A rejected promise nobody handled means state is unknown; log it in full and
// restart rather than continuing in an undefined condition.
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  void shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  void shutdown('uncaughtException', 1);
});

bootstrap().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});
