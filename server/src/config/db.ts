import mongoose from 'mongoose';

import { createLogger } from '../utils/logger.js';
import { env } from './env.js';

const log = createLogger('database');

/**
 * Human-readable form of mongoose's numeric readyState. 99 is the driver's
 * "uninitialized" state, which is why this is a map rather than an array.
 */
const READY_STATE: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
  99: 'uninitialized',
};

export function getDatabaseState(): string {
  return READY_STATE[mongoose.connection.readyState] ?? 'unknown';
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

let listenersAttached = false;

function attachConnectionListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;

  mongoose.connection.on('connected', () => log.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => log.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => log.info('MongoDB reconnected'));
  mongoose.connection.on('error', (error: Error) =>
    log.error({ err: error }, 'MongoDB connection error'),
  );
}

/**
 * Connect to MongoDB.
 *
 * Called once from server.ts before the HTTP listener starts, so the process
 * never accepts traffic it cannot serve. Mongoose buffers commands while
 * reconnecting, so transient drops after startup do not need handling here.
 */
export async function connectDatabase(uri: string = env.MONGODB_URI): Promise<void> {
  attachConnectionListeners();

  // Fail fast rather than buffering forever behind an unreachable server.
  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    maxPoolSize: 20,
    minPoolSize: 2,
    autoIndex: !env.isProduction, // Indexes are built explicitly in production.
  });

  log.info({ database: mongoose.connection.name }, 'Database ready');
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  log.info('MongoDB connection closed');
}
