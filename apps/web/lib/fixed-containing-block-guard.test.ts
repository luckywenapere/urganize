import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Nothing around a page may become a containing block for `position: fixed`
 * (2026-10-11, v1.115.6). A transform (even `translateY(0)`), a filter, a
 * backdrop-filter, `will-change: transform`, `perspective` or `contain` on an
 * ancestor makes every fixed element inside it anchor to that ancestor instead
 * of the screen. AppShell's `.app-layout lazy-fade lazy-fade-in` wrapper did
 * exactly that, so Notifications opened from More after scrolling showed at the
 * top of the PAGE, off screen, and the rollout chat could not pin its composer
 * over the iOS keyboard. Read from the source, since there are no component
 * tests in this repo.
 */

const WEB = join(__dirname, '..');
const stripCss = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '');
const stripTs = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const css = stripCss(readFileSync(join(WEB, 'app', 'globals.css'), 'utf8'));
// The page wrappers live in AppShell and, since URG-314 batch 7, in the
// workspace frame the /dashboard and /settings layouts mount.
const shell = stripTs(
  readFileSync(join(WEB, 'components', 'app', 'AppShell.tsx'), 'utf8') +
    readFileSync(join(WEB, 'components', 'app', 'WorkspaceFrame.tsx'), 'utf8')
);

/** Every declaration block whose selector names the class. */
function blocksFor(className: string): string[] {
  const out: string[] = [];
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rule.exec(css))) {
    const selectors = match[1].split(',').map((part) => part.trim());
    if (selectors.some((selector) => new RegExp(`\\.${className}(?![\\w-])`).test(selector))) {
      out.push(match[2]);
    }
  }
  return out;
}

const CONTAINING_BLOCK_DECLARATION =
  /(^|;|\s)(transform|filter|backdrop-filter|-webkit-backdrop-filter|perspective|contain|container-type)\s*:(?!\s*none\b)|will-change\s*:[^;]*(transform|filter|perspective)/;

describe('the page wrapper never anchors fixed elements', () => {
  it('positive control: the pattern catches the old resting transform', () => {
    expect(CONTAINING_BLOCK_DECLARATION.test('opacity: 1; transform: translateY(0);')).toBe(true);
    expect(CONTAINING_BLOCK_DECLARATION.test('backdrop-filter: blur(4px)')).toBe(true);
    expect(CONTAINING_BLOCK_DECLARATION.test('opacity: 1; transform: none;')).toBe(false);
  });

  it('.lazy-fade-in rests at transform: none', () => {
    const blocks = blocksFor('lazy-fade-in');
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block).toMatch(/transform\s*:\s*none/);
      expect(CONTAINING_BLOCK_DECLARATION.test(block)).toBe(false);
    }
  });

  it('.app-layout and .app-shell-frame declare nothing that anchors fixed elements', () => {
    for (const name of ['app-layout', 'app-shell-frame', 'app-body']) {
      for (const block of blocksFor(name)) {
        expect(CONTAINING_BLOCK_DECLARATION.test(block), `.${name}: ${block.trim()}`).toBe(false);
      }
    }
  });

  it("AppShell's wrappers carry no transform, filter or blur utilities", () => {
    const wrappers = shell.match(/className=\{?[`'"][^`'"]*app-(layout|shell-frame)[^`'"]*[`'"]/g) ?? [];
    expect(wrappers.length).toBeGreaterThanOrEqual(3);
    for (const wrapper of wrappers) {
      expect(wrapper).not.toMatch(
        /(^|\s|["'`])(transform|translate-|-translate-|scale-|rotate-|skew-|blur|backdrop-|filter|will-change|contain-|perspective|animate-)/
      );
    }
  });
});

describe('the rollout chat on a phone keyboard', () => {
  const chat = stripTs(readFileSync(join(WEB, 'components', 'releases', 'ReleaseChatSection.tsx'), 'utf8'));

  it('pins to the visual viewport through the shared layout rule', () => {
    expect(chat).toContain('useKeyboardViewport()');
    expect(chat).toContain('releaseChatLayout(');
    expect(chat).toContain('offsetTopPx: keyboard.offsetTopPx');
    expect(chat).toContain('viewportHeightPx: keyboard.viewportHeightPx');
  });

  it('is restyled in place, never portalled (that would remount the field and drop the keyboard)', () => {
    expect(chat).not.toContain('createPortal');
  });

  it('only changes a phone: the keyboard mode and the scroll lock are both gated on it', () => {
    expect(chat).toContain('const isPhone = !useIsDesktopViewport()');
    expect(chat).toMatch(/if \(!isPhone\) return;\s*lockedScrollY\.current = window\.scrollY;\s*return lockBodyScroll\(\);/);
  });

  it('freezes the flow measurement while the box is pinned', () => {
    expect(chat).toContain('usePinnedChatHeight(slotRef, keyboardMode)');
  });

  it('hides the bottom tab bar while anyone types on a phone', () => {
    expect(css).toMatch(/:root\[data-keyboard-open='true'\] \.mobile-nav-bar \{\s*display: none;/);
  });
});
