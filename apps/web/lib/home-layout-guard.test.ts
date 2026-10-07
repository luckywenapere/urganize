import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Home's layout (2026-10-07). Reading the files is the only way to hold these:
 * vitest has no layout engine, and nothing type-checks a CSS value.
 */

const WEB = join(__dirname, '..');
const read = (...parts: string[]) => readFileSync(join(WEB, ...parts), 'utf8');
const css = read('app', 'globals.css').replace(/\/\*[\s\S]*?\*\//g, '');
const skeleton = read('components', 'loading', 'HomeSkeleton.tsx');
const split = read('components', 'home', 'HomeDesktopSplit.tsx');

describe('Home layout', () => {
  it('has no two-column grid any more: every group is a single-column stack', () => {
    expect(css).not.toContain('.home-two-col');
  });

  it('lets the conversation side shrink below its content', () => {
    // A flex child's floor is its widest content unless min-width is zero, so a
    // long line in the transcript would push the page sideways.
    expect(split).toMatch(/min-w-0 flex-1/);
  });

  it('locks the desktop split to the screen', () => {
    expect(css).toMatch(/\.home-split-height\s*\{[^}]*height:/);
    expect(split).toContain('home-split-height');
  });
});

describe('Home loading skeleton', () => {
  it('has both shapes, switched by CSS so the server markup is right at every width', () => {
    expect(skeleton).toContain('home-scene-container');
    expect(skeleton).toContain('home-split-height');
    expect(skeleton).toContain('lg:hidden');
    expect(skeleton).toMatch(/hidden[^"'`]*lg:flex/);
  });

  it('does not invent viewport columns the page does not have', () => {
    expect(skeleton).not.toMatch(/sm:grid-cols-2/);
  });
});
