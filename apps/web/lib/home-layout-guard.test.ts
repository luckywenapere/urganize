import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Home's layout (2026-10-07; one page on a computer since 2026-10-27). Reading
 * the files is the only way to hold these: vitest has no layout engine, and
 * nothing type-checks a CSS value.
 */

const WEB = join(__dirname, '..');
const read = (...parts: string[]) => readFileSync(join(WEB, ...parts), 'utf8');
const css = read('app', 'globals.css').replace(/\/\*[\s\S]*?\*\//g, '');
const skeleton = read('components', 'loading', 'HomeSkeleton.tsx');
const page = read('app', 'dashboard', 'home', 'HomePageClient.tsx');
const sessions = read('components', 'chappi', 'UrgansSessionsLayout.tsx');

describe('Home layout', () => {
  it('has no two-column grid any more: every group is a single-column stack', () => {
    expect(css).not.toContain('.home-two-col');
  });

  it('is one centred column on a computer that scrolls with the page', () => {
    expect(page).toContain('mx-auto w-full max-w-[920px]');
    expect(page).not.toContain('home-split-height');
  });

  it('keeps the screen-locked split for the desktop UrgAns page, which still needs it', () => {
    expect(css).toMatch(/\.home-split-height\s*\{[^}]*height:/);
    expect(sessions).toContain('home-split-height');
    // A flex child's floor is its widest content unless min-width is zero, so a
    // long line in the transcript would push the page sideways.
    expect(sessions).toMatch(/min-w-0 flex-1/);
  });
});

describe('Home loading skeleton', () => {
  it('is one column at every width, centred at the desktop width, with no chat', () => {
    expect(skeleton).toContain('home-scene-container');
    expect(skeleton).toContain('lg:max-w-[920px]');
    expect(skeleton).not.toContain('home-split-height');
    expect(skeleton).not.toContain('ChappiConversationSkeleton');
  });

  it('keeps the phone’s pinned box placeholder phone only', () => {
    expect(skeleton).toMatch(/home-dock[^"']*lg:hidden/);
  });

  it('does not invent viewport columns the page does not have', () => {
    expect(skeleton).not.toMatch(/sm:grid-cols-2/);
  });
});
