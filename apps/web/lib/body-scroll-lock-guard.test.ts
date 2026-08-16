import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Containment guard for hand-rolled body scroll locks (2026-08-16).
//
// lib/body-scroll-lock.ts exists because per-modal save/restore of
// document.body.style.overflow breaks the moment two modals overlap: the
// second captures the first's 'hidden' as its "original" and writes it back
// on close, leaving the page unscrollable until a full reload.
//
// The module landed, but three components were never migrated and kept the
// hand-rolled version — TaskUIProvider's task detail pop-up (the worst of
// them, since TaskOutcomeSheet is DESIGNED to stack on top of it and does use
// the shared lock), NoteDeleteDialog, and DeleteReleaseDialog. All three are
// fixed; this test is what stops a fourth appearing.
//
// The baseline is EMPTY on purpose. Writing document.body.style.overflow
// anywhere outside the lock module is now a build-visible mistake.
//
// If this test failed on your change: don't save/restore overflow yourself —
// `useEffect(() => lockBodyScroll(), [openCondition])` composes with every
// other modal and is safe to call from any number of them at once.

const PATTERN = /document\.body\.style\.(overflow|paddingRight)/;

/** The one file allowed to touch it — the lock itself. */
const ALLOWED = new Set(['lib/body-scroll-lock.ts']);

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

describe('body scroll lock containment', () => {
  it('positive control: the pattern still matches the lock module itself', () => {
    // Guards the guard. If PATTERN ever rots, the check below would pass
    // vacuously and a hand-rolled lock could slip in unnoticed.
    const known = readFileSync(join(APP_ROOT, 'lib/body-scroll-lock.ts'), 'utf8');
    expect(PATTERN.test(known)).toBe(true);
  });

  it('only the lock module writes document.body.style.overflow', () => {
    const files = [
      ...collectTsFiles(join(APP_ROOT, 'app')),
      ...collectTsFiles(join(APP_ROOT, 'lib')),
      ...collectTsFiles(join(APP_ROOT, 'components')),
    ];

    const matching = files
      .filter((file) => PATTERN.test(readFileSync(file, 'utf8')))
      .map((file) => relative(APP_ROOT, file).split('\\').join('/'))
      .sort();

    expect(matching).toEqual([...ALLOWED].sort());
  });
});
