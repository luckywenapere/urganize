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
  it('positive control: the pattern still matches a known baseline file', () => {
    // Guards the guard — if PATTERN ever rots (helper renamed, regex typo),
    // the containment check below would pass vacuously. This fails first.
    const known = readFileSync(join(APP_ROOT, 'app/api/releases/_shared.ts'), 'utf8');
    expect(PATTERN.test(known)).toBe(true);
  });

  it('the pattern matches exactly the baseline files — no spread, no stale entries', () => {
    // Set EQUALITY, not subset: a new file adopting the pattern fails (spread),
    // AND a baseline file that no longer matches fails until its entry is
    // deleted (ratcheting the list down as routes get cleaned), AND a deleted
    // file can't leave a stale entry behind.
    const files = [
      ...collectTsFiles(join(APP_ROOT, 'app')),
      ...collectTsFiles(join(APP_ROOT, 'lib')),
      ...collectTsFiles(join(APP_ROOT, 'components')),
    ];

    const matching = files
      .filter((file) => PATTERN.test(readFileSync(file, 'utf8')))
      .map((file) => relative(APP_ROOT, file).replace(/\\/g, '/'))
      .sort();

    const spread = matching.filter((rel) => !BASELINE.has(rel));
    const cleaned = [...BASELINE].filter((rel) => !matching.includes(rel)).sort();

    expect(
      spread,
      `New files using the deprecated schema-missing fallback (see CLAUDE.md "Patterns being deprecated in v1"): ${spread.join(', ')}`
    ).toEqual([]);
    expect(
      cleaned,
      `Baseline files no longer using the pattern — delete their BASELINE entries to ratchet the list down: ${cleaned.join(', ')}`
    ).toEqual([]);
  });
});
