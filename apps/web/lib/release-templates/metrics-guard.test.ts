import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Perf guard (2026-10-15, URG-314). The playbooks are ~90 KB of minified data.
// They left the root layout's JavaScript only because the modules on the
// auth-store import chain stopped importing loader.ts. These files must stay
// free of template data (and of release-planning, which reaches it), or every
// page downloads the playbooks again.
const LIB = join(__dirname, '..');
const PURE = [
  'release-templates/metrics.ts',
  'plan-phase.ts',
  'ready-today.ts',
  'onboarding-readiness.ts',
  'first-session.ts',
];
const FORBIDDEN = /from\s+['"][^'"]*(release-templates\/(loader|single|ep|album)|\/(single|ep|album)|release-planning)['"]/;

describe('playbooks stay out of the shared bundle', () => {
  for (const file of PURE) {
    it(`${file} imports no template data`, () => {
      const lines = readFileSync(join(LIB, file), 'utf8')
        .split('\n')
        .filter((line) => !/^\s*import\s+type\b/.test(line) && FORBIDDEN.test(line));
      expect(lines).toEqual([]);
    });
  }
});
