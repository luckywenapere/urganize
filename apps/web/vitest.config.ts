import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Deliberately narrow: only pure-logic unit tests under lib/. Billing math,
// plan resolution, the paywall allowlist, and the subscription snapshot are
// the highest-consequence code paths in the app and the only ones with
// regression tests for now — components and routes stay on manual testing
// per CLAUDE.md's v1 testing posture.
export default defineConfig({
  // Mirrors the `@/*` path alias in tsconfig.json so a lib module under test
  // can import across directories the same way the app does.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
