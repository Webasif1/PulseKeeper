import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/**
 * Unmount between tests.
 *
 * Testing Library registers this automatically only when Vitest globals are
 * enabled. They are not, so without this every render accumulates in the same
 * document and queries start finding elements from earlier tests.
 */
afterEach(() => {
  cleanup();
});

/**
 * jsdom implements neither matchMedia nor randomUUID, and the theme provider
 * and toast system need them at import time.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    value: { ...globalThis.crypto, randomUUID: () => Math.random().toString(36).slice(2) },
  });
}
