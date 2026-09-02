/**
 * Test environment.
 *
 * Runs before any module is imported, so `config/env.ts` finds a valid
 * configuration without a `.env` file. dotenv does not overwrite variables that
 * are already set, so these values also win over a developer's local `.env`.
 */
process.env.NODE_ENV = 'test';
process.env.PORT = '5099';
process.env.MONGODB_URI = 'mongodb://localhost:27017/pulsekeeper-test';
process.env.JWT_SECRET = 'test-secret-value-that-is-long-enough-to-pass';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.MONITOR_CRON_SECRET = 'test-monitor-secret';
process.env.MONITOR_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
