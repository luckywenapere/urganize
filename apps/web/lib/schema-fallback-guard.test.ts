import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Containment guard for the deprecated "schema-missing fallback" pattern.
//
// CLAUDE.md (API layer → "Patterns being deprecated in v1") keeps the
// existing helpers for dev convenience but forbids ADDING the pattern to new
// routes. The pattern had spread to ~190 references across the files frozen
// below; this test turns the CLAUDE.md directive into something enforceable:
// it fails the moment a file NOT on the baseline starts using the helpers.
//
// If this test failed on your change: don't add the helpers to the new file —
// let a missing table surface as a normal 500 (environments are properly
// migrated in v1). If you instead REMOVED the pattern from a baseline file,
// delete that file's entry below; shrinking the list is always welcome.

const PATTERN =
  /buildMissingTableResponse|isOptionalTableMissingError|buildTaskSchemaResponse|isTaskSchemaMissingError|ensureReleaseOpsSchema/;

const BASELINE = new Set([
  'app/api/admin/pricing-validation/route.ts',
  'app/api/command-center/route.ts',
  'app/api/notifications/read/route.ts',
  'app/api/notifications/route.ts',
  'app/api/pricing-validation/_shared.ts',
  'app/api/pricing-validation/route.ts',
  'app/api/releases/[releaseId]/assets/[assetId]/route.ts',
  'app/api/releases/[releaseId]/assets/route.ts',
  'app/api/releases/[releaseId]/collaborators/route.ts',
  'app/api/releases/[releaseId]/generate-status/route.ts',
  'app/api/releases/[releaseId]/metadata/route.ts',
  'app/api/releases/[releaseId]/route.ts',
  'app/api/releases/[releaseId]/tailor-plan/route.ts',
  'app/api/releases/[releaseId]/task-groups/[groupId]/route.ts',
  'app/api/releases/[releaseId]/task-groups/route.ts',
  'app/api/releases/[releaseId]/tasks/route.ts',
  'app/api/releases/_shared.ts',
  'app/api/releases/route.ts',
  'app/api/tasks/[id]/attachments/[attachmentId]/route.ts',
  'app/api/tasks/[id]/attachments/route.ts',
  'app/api/tasks/[id]/comments/[commentId]/route.ts',
  'app/api/tasks/[id]/comments/route.ts',
  'app/api/tasks/[id]/route.ts',
  'app/api/tasks/all/route.ts',
  'app/api/tasks/route.ts',
  'app/api/ui-drafts/_shared.ts',
  'app/api/ui-drafts/route.ts',
  'app/api/workspace/artist/route.ts',
  'app/api/workspace/members/[id]/route.ts',
  'app/api/workspace/members/invite/route.ts',
  'app/api/workspace/members/route.ts',
  'lib/tasks-server.ts',
]);

const APP_ROOT = join(__dirname, '..');

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTsFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('schema-missing fallback containment', () => {
  it('the deprecated pattern does not spread to new files', () => {
    const files = [
      ...collectTsFiles(join(APP_ROOT, 'app')),
      ...collectTsFiles(join(APP_ROOT, 'lib')),
      ...collectTsFiles(join(APP_ROOT, 'components')),
    ];

    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(APP_ROOT, file).replace(/\\/g, '/');
      if (BASELINE.has(rel)) continue;
      if (PATTERN.test(readFileSync(file, 'utf8'))) {
        offenders.push(rel);
      }
    }

    expect(
      offenders,
      `New files using the deprecated schema-missing fallback (see CLAUDE.md "Patterns being deprecated in v1"): ${offenders.join(', ')}`
    ).toEqual([]);
  });
});
