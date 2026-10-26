import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Home's skeleton keeps the live Home's shape (URG-364, 2026-10-18). Oyin saw
 * the old skeleton (an eyebrow, a tall card, a rounded pill) and then an old
 * "Open it" move card flash before the golden layout B Home. vitest has no
 * layout engine, so these read the files: the skeleton must carry the same
 * blocks and box classes as HomeGreeting, OneThing and HomeRow, and Home must
 * not paint until its dismissed next moves are known.
 */

const WEB = join(__dirname, '..');
const read = (...parts: string[]) => readFileSync(join(WEB, ...parts), 'utf8');
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

const skeleton = code(read('components', 'loading', 'HomeSkeleton.tsx'));
const oneThing = code(read('components', 'home', 'v2', 'OneThing.tsx'));
const homeFour = code(read('components', 'home', 'v2', 'HomeFour.tsx'));
const page = code(read('app', 'dashboard', 'home', 'HomePageClient.tsx'));
const movesStore = code(read('stores', 'useNextMovesStore.ts'));

const column = (() => {
  const start = skeleton.indexOf('function HomeColumnBlocks');
  const end = skeleton.indexOf('function PinnedAskBoxPlaceholder');
  return skeleton.slice(start, end);
})();

describe('Home skeleton matches the live Home (layout B)', () => {
  it('leads with the greeting (date, then the name line), like the live Home', () => {
    expect(homeFour).toContain('data-home-block="greeting"');
    const first = column.indexOf('data-skeleton="greeting"');
    expect(first).toBeGreaterThan(-1);
    expect(column.indexOf('data-skeleton="date"')).toBeGreaterThan(first);
    expect(column.indexOf('data-skeleton="date"')).toBeLessThan(column.indexOf('data-skeleton="title"'));
  });

  it('draws no rollout hero: no drop line, faces or phase bars (removed 2026-10-26)', () => {
    expect(column).not.toContain('data-skeleton="drop"');
    expect(column).not.toContain('data-skeleton="team"');
    expect(column).not.toContain('data-skeleton="phases"');
  });

  it('draws the bell (phone only, like HomeBell) top right', () => {
    expect(column).toMatch(/h-11 w-11[^"']*lg:hidden[^"']*" data-skeleton="bell"/);
    expect(homeFour).toContain('<HomeBell />');
  });

  it('keeps the blocks in the live order, with the live gaps', () => {
    const order = ['greeting', 'one-thing'].map((name) => column.indexOf(`data-skeleton="${name}"`));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(homeFour).toMatch(/<HomeGreeting home=\{home\} \/>\s*<div className="mt-6">\s*<Fenced name="one-thing">/);
    expect(column).toContain('className="mt-6" data-skeleton="one-thing"');
  });

  it('draws the One Thing as the same golden card', () => {
    expect(oneThing).toContain("aspect-[1.618/1]");
    expect(oneThing).toContain('rounded-[20px]');
    expect(column).toMatch(/aspect-\[1\.618\/1\][^"']*rounded-\[20px\]/);
  });

  it('draws no rows under the card, like Home since 2026-10-26', () => {
    expect(column).not.toContain('data-skeleton="rows"');
    expect(homeFour).not.toContain('data-home-block="rows"');
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
