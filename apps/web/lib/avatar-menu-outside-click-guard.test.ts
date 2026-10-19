import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * On a phone the avatar menu is a SwipeSheet portalled to <body>,
 * outside the avatar's wrapper. The desktop "tap outside closes it" listener
 * read every tap on a sheet row as outside and closed the sheet on pointerdown,
 * before the row's click fired, so Relationships, Opportunities, Connections,
 * Settings, Help and search all did nothing. The listener must be desktop only.
 */
const source = readFileSync(
  path.join(__dirname, '..', 'components', 'shell', 'swipe', 'AvatarMenu.tsx'),
  'utf8'
);

describe('avatar menu outside-click listener', () => {
  it('only runs for the desktop popover', () => {
    const effect = source.slice(source.indexOf('useEffect(() => {'), source.indexOf("document.addEventListener('pointerdown'"));
    expect(effect).toMatch(/if \(!open \|\| !isDesktop\) return;/);
  });

  it('re-runs when the viewport changes', () => {
    expect(source).toMatch(/\}, \[open, isDesktop\]\);/);
  });

  it('the phone menu is still a portalled sheet, which is why the guard matters', () => {
    expect(source).toMatch(/<SwipeSheet open=\{open && !isDesktop\}/);
  });
});
