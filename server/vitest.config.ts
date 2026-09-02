import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    // Loaded before any module reads process.env, so the environment schema
    // validates without a real .env file present.
    setupFiles: ['./src/__tests__/setup.ts'],
    // Test files share one MongoDB database and clear it between tests, so they
    // must not run concurrently.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__/**', 'src/server.ts'],
    },
  },
});
