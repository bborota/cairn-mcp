import { defineConfig } from 'vitest/config';

/** Matches apps/server's own vitest.config.ts: PoW solving against real production parameters
 * (plan E.4: 2-5 seconds by design) plus a live HTTP round trip easily exceeds vitest's 5s
 * default in the integration suite. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
