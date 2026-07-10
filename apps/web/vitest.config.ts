import { defineConfig } from 'vitest/config';

// Deliberately narrow: only pure-logic unit tests under lib/. Billing math,
// plan resolution, the paywall allowlist, and the subscription snapshot are
// the highest-consequence code paths in the app and the only ones with
// regression tests for now — components and routes stay on manual testing
// per CLAUDE.md's v1 testing posture.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
