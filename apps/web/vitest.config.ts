import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Deliberately narrow: pure-logic unit tests under lib/. Billing math, plan
// resolution, the paywall allowlist, and the subscription snapshot are the
// highest-consequence code paths in the app and the only ones with regression
// tests for now — components stay on manual testing per CLAUDE.md's v1
// testing posture.
//
// Widened to app/ on 2026-08-14 for ONE route: /api/urgans's confirmed-action
// branch is the only path in the app that executes a confirmation-gated tool,
// and "it must refuse to run anything else" is a security property worth
// pinning rather than re-checking by hand. Route tests still need every
// external seam mocked, so this is not an invitation to test routes broadly.
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
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
  },
});
