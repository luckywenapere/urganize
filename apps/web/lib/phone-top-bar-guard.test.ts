import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The phone has no top bar (2026-10-11, founder call): below `lg` the header is
 * its safe-area padding and nothing else, on every screen, and search lives in
 * the bottom bar's More sheet. Read from the source, since there are no
 * component tests in this repo.
 */

const WEB = join(__dirname, '..');
const strip = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const read = (...parts: string[]) => strip(readFileSync(join(WEB, ...parts), 'utf8'));

describe('the phone has no top bar', () => {
  const nav = read('components', 'shell', 'TopNav.tsx');

  it('keeps only the safe-area padding on the header', () => {
    expect(nav).toContain('pt-[env(safe-area-inset-top,0px)]');
  });

  it('folds the row to nothing below lg on every page, and keeps the desktop row', () => {
    expect(nav).toContain('flex h-0 w-full');
    expect(nav).toContain('lg:grid lg:h-[72px] lg:grid-cols-[1fr_auto_1fr]');
    expect(nav).not.toContain('h-14');
    expect(nav).not.toContain('isUrgansPage');
  });

  it('shows the bar search button on a desktop only', () => {
    expect(nav).toMatch(/data-tour="shell-search"[\s\S]*?className="[^"]*\bhidden\b[^"]*\blg:inline-flex\b/);
  });

  it('keeps the bell mounted (its panel is what Home\'s phone bell opens)', () => {
    expect(nav).toContain('<NotificationsBell />');
  });

  it('puts Search in the More sheet header, left of Close, with the bar button’s action', () => {
    const bar = read('components', 'shell', 'BottomBar.tsx');
    const sheet = bar.slice(bar.indexOf('function MoreSheet('));
    const search = sheet.indexOf('data-tour="shell-mobile-search"');
    expect(search).toBeGreaterThan(-1);
    expect(sheet).toContain('aria-label="Search"');
    expect(search).toBeLessThan(sheet.indexOf('{closeButton}', search));
    expect(search).toBeLessThan(sheet.indexOf('items.map('));
    expect(bar).toContain('if (hasPullReveal()) revealListSearch();');
    expect(bar).toContain('else openCommand();');
  });

  it('drops the 4rem the bar used to take from the phone notifications panel', () => {
    const bell = read('components', 'app', 'NotificationsBell.tsx');
    expect(bell).toContain('top-[calc(env(safe-area-inset-top,0px)+1rem)]');
    expect(bell).not.toContain('top-[calc(env(safe-area-inset-top,0px)+4rem)]');
  });
});
