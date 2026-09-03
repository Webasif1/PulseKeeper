import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
// From vitest/config, not vite: it is the same defineConfig widened to accept
// the `test` block, which keeps one config file instead of two.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    port: 5173,
    // The API is called on its own origin with credentials, so CORS and the
    // cookie policy behave in development exactly as they will in production.
    // A proxy would paper over both and hide real misconfiguration until deploy.
  },

  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        // Recharts is large and only the chart pages need it; splitting it out
        // keeps the initial dashboard payload small.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
        },
      },
    },
  },

  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
