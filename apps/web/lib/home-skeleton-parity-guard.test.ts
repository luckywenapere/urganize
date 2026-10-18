import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Home's skeleton keeps the live Home's shape (URG-364, 2026-10-18). Oyin saw
 * the old skeleton (an eyebrow, a tall card, a rounded pill) and then an old
 * "Open it" move card flash before the golden layout B Home. vitest has no
 * layout engine, so these read the files: the skeleton must carry the same
 * blocks and box classes as ReleaseHeader, OneThing and HomeRow, and Home must
 * not paint until its dismissed next moves are known.
 */

const WEB = join(__dirname, '..');
const read = (...parts: string[]) => readFileSync(join(WEB, ...parts), 'utf8');
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

const skeleton = code(read('components', 'loading', 'HomeSkeleton.tsx'));
const header = code(read('components', 'home', 'v2', 'ReleaseHeader.tsx'));
const oneThing = code(read('components', 'home', 'v2', 'OneThing.tsx'));
const homeFour = code(read('components', 'home', 'v2', 'HomeFour.tsx'));
const rows = code(read('components', 'home', 'v2', 'HomeRow.tsx'));
const page = code(read('app', 'dashboard', 'home', 'HomePageClient.tsx'));
const movesStore = code(read('stores', 'useNextMovesStore.ts'));

const column = (() => {
  const start = skeleton.indexOf('function HomeColumnBlocks');
  const end = skeleton.indexOf('function PinnedAskBoxPlaceholder');
  return skeleton.slice(start, end);
})();

describe('Home skeleton matches the live Home (layout B)', () => {
  it('has no eyebrow: the live header leads with the title', () => {
    expect(header).not.toMatch(/uppercase tracking/);
    // The first block in the column is the header row, whose first line is the title.
    const first = column.indexOf('data-skeleton="release-header"');
    expect(first).toBeGreaterThan(-1);
    expect(column.indexOf('data-skeleton="title"')).toBeGreaterThan(first);
    expect(column.indexOf('data-skeleton="title"')).toBeLessThan(column.indexOf('data-skeleton="drop"'));
    expect(column).not.toMatch(/h-3 w-32/);
  });

  it('draws the bell (phone only, like HomeBell) and the team top right', () => {
    expect(column).toMatch(/h-11 w-11[^"']*lg:hidden[^"']*" data-skeleton="bell"/);
    expect(column).toContain('data-skeleton="team"');
    expect(header).toContain('<HomeBell />');
    expect(header).toContain('<TeamAvatars');
  });

  it('keeps the blocks in the live order, with the live gaps', () => {
    const order = ['release-header', 'phases', 'one-thing', 'rows'].map((name) =>
      column.indexOf(`data-skeleton="${name}"`)
    );
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(header).toMatch(/mt-4 flex gap-1\.5/);
    expect(column).toMatch(/mt-4 flex gap-1\.5" data-skeleton="phases"/);
    expect(homeFour).toMatch(/<div className="mt-9">\s*<Fenced name="one-thing">/);
    expect(column).toContain('className="mt-9" data-skeleton="one-thing"');
  });

  it('draws the One Thing as the same golden card', () => {
    expect(oneThing).toContain("aspect-[1.618/1]");
    expect(oneThing).toContain('rounded-[20px]');
    expect(column).toMatch(/aspect-\[1\.618\/1\][^"']*rounded-\[20px\]/);
  });

  it('draws numbers as 56px rows with hairlines, not a rounded pill', () => {
    expect(rows).toContain("HOME_ROWS = 'divide-y divide-stroke-subtle'");
    expect(rows).toMatch(/HOME_ROW =[\s\S]*h-14/);
    expect(column).toContain('divide-y divide-stroke-subtle" data-skeleton="rows"');
    expect(column).toMatch(/flex h-14 items-center gap-3 px-1" data-skeleton="row"/);
    // The old placeholder: a full-width rounded pill under the card.
    expect(column).not.toMatch(/h-14 w-full rounded-\[20px\]/);
  });
});

describe('Home paints once, never an in-between One Thing', () => {
  it('asks for dismissed next moves with Home and waits for them', () => {
    expect(page).toContain('selectHomeMovesSettled');
    expect(page).toMatch(/loadMoves\(viewerKey\)/);
    expect(page).toMatch(/if \(authLoading \|\| homeLoading \|\| !home \|\| !movesSettled\)/);
  });

  it('always settles: answered, failed, no session or timed out', () => {
    expect(movesStore).toMatch(/finally \{\s*clearTimeout\(timer\);\s*settle\(\);/);
    expect(movesStore).toMatch(/SETTLE_TIMEOUT_MS = \d+/);
    expect(movesStore).toContain('settled: {}');
  });
});
