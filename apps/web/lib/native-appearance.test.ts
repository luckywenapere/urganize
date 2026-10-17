import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOOT_LOADER_EVENT, resolvePageAppearance } from './native-appearance';

// What the Expo shell is told about the page, so the bars above and below the
// webview match it. The design token is preferred because it does not animate:
// a computed background read mid-transition would report a colour between two
// themes.

describe('resolvePageAppearance', () => {
  it('reads the ground colour token and pairs it with readable bar text', () => {
    expect(resolvePageAppearance({ token: ' 245 240 230', computed: 'rgb(0, 0, 0)' })).toEqual({
      background: '#f5f0e6',
      statusBar: 'dark',
    });
    expect(resolvePageAppearance({ token: '13 18 14', computed: null })).toEqual({
      background: '#0d120e',
      statusBar: 'light',
    });
  });

  it('falls back to the computed background when the token is missing or unreadable', () => {
    expect(resolvePageAppearance({ token: '', computed: 'rgb(245, 240, 230)' })).toEqual({
      background: '#f5f0e6',
      statusBar: 'dark',
    });
    expect(resolvePageAppearance({ token: 'not a colour', computed: 'rgb(13, 18, 14)' })?.background).toBe('#0d120e');
  });

  it('says nothing rather than guess when neither can be read', () => {
    expect(resolvePageAppearance({ token: undefined, computed: 'rgba(0, 0, 0, 0)' })).toBeNull();
    expect(resolvePageAppearance({ token: null, computed: undefined })).toBeNull();
  });
});

describe('boot frame (2026-10-18, double load screen)', () => {
  it('reports the boot frame ground while a loader is up, over the theme token', () => {
    // An older phone app paints its launch screen in the old ink; the first
    // loading frame matches it, and the bars must too, or they draw bands.
    expect(
      resolvePageAppearance({ token: '12 12 13', computed: 'rgb(12, 12, 13)', bootGround: 'rgb(13, 18, 14)' })
    ).toEqual({ background: '#0d120e', statusBar: 'light' });
    expect(resolvePageAppearance({ token: '12 12 13', computed: null, bootGround: null })?.background).toBe('#0c0c0d');
  });

  const root = resolve(__dirname, '../../..');
  const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

  it('keeps the loader event name in step with LoadingScreen', () => {
    expect(read('packages/ui/src/LoadingScreen.tsx')).toContain(`BOOT_LOADER_EVENT = '${BOOT_LOADER_EVENT}'`);
  });

  it('keeps the phone app launch screen, manifest and theme colour on the dark ground', () => {
    const css = read('apps/web/app/globals.css');
    expect(css).toMatch(/:root:not\(\[data-theme='light'\]\) \{[^}]*--color-bg-base: 12 12 13;/);
    expect(read('apps/mobile/app.config.ts')).toContain("const INK = '#0c0c0d';");
    expect(read('apps/mobile/src/OfflineScreen.tsx')).toContain("export const INK = '#0c0c0d';");
    expect(read('apps/web/app/manifest.ts')).toContain("background_color: '#0c0c0d'");
    expect(read('apps/web/app/layout.tsx')).toContain("themeColor: '#0c0c0d'");
  });

  it('draws the mark at the launch screen size: 544 / 1400 of the 200pt splash image', () => {
    expect(read('apps/mobile/app.config.ts')).toMatch(/image: '\.\/assets\/icon-foreground\.png',\s*imageWidth: 200,/);
    expect(read('packages/ui/src/LoadingScreen.tsx')).toContain('BOOT_MARK_WIDTH = 77.7;');
  });

  it('sets the boot ground and shift before first paint, only inside the app', () => {
    const layout = read('apps/web/app/layout.tsx');
    expect(layout).toContain("root.setAttribute('data-native-shell', '1')");
    expect(layout).toContain("root.style.setProperty('--boot-ground', ground)");
    expect(layout).toContain("root.style.setProperty('--boot-shift', shift + 'px')");
    const css = read('apps/web/app/globals.css');
    expect(css).toContain('html[data-native-shell] .urg-boot-frame {');
    expect(css).toContain('transform: translateY(calc(-1 * var(--boot-shift, 0px)));');
  });
});
