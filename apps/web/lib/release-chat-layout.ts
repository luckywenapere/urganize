import type { CSSProperties } from 'react';

/**
 * Where the rollout Chat scene's box sits (2026-10-11, v1.115.6).
 *
 * Two modes:
 *
 *  - `flow`: the box is in the page, sized by usePinnedChatHeight so the
 *    composer ends just above the bottom tab bar (phone) or the bottom of the
 *    column that scrolls the scene (desktop). Every desktop, and a phone with
 *    the keyboard down.
 *
 *  - `keyboard`: a phone with the on-screen keyboard up. The box leaves the
 *    page flow and pins itself to the region the person can actually SEE, read
 *    from window.visualViewport (offsetTop + height, via useKeyboardViewport).
 *    The composer is then the last thing above the keyboard (and above iOS's
 *    form accessory bar, which the visual viewport already excludes), and the
 *    message list fills everything above it.
 *
 * Why the visual viewport and not 100dvh: on iOS Safari neither the layout
 * viewport nor `100dvh` shrinks for the keyboard; it simply covers the bottom
 * of the screen. A box sized or placed against either ends up behind the
 * keyboard, which is the bug this fixes (v1.115.5 screenshot: an empty dark
 * screen above the keyboard and the composer hidden underneath it). Placing
 * the box with `position: fixed` relies on no ancestor being a containing
 * block for fixed elements; see .lazy-fade-in in globals.css and
 * lib/fixed-containing-block-guard.test.ts.
 *
 * The box is restyled, never re-parented or portalled: moving the composer's
 * textarea to another parent would remount it, drop focus and close the
 * keyboard the moment it opened.
 */
export type ReleaseChatLayoutInput = {
  /** Below Tailwind's `lg` (1024px). */
  isPhone: boolean;
  keyboardOpen: boolean;
  /** visualViewport.offsetTop in px (how far iOS panned the visible region). */
  offsetTopPx: number;
  /** visualViewport.height in px; 0 before the first client measurement. */
  viewportHeightPx: number;
  /** usePinnedChatHeight's last flow measurement, or null before the first. */
  flowHeightPx: number | null;
};

export type ReleaseChatLayout = {
  mode: 'flow' | 'keyboard';
  /** Style for the element that keeps the box's place in the page. */
  slot: CSSProperties;
  /** Style for the box itself (message list + composer). */
  box: CSSProperties;
};

/** First paint, before anything is measured. */
export const RELEASE_CHAT_FALLBACK_HEIGHT = 'calc(100dvh - 16rem)';

/** Above the page's own layers (the sticky header is z-30) inside .app-layout. */
export const RELEASE_CHAT_KEYBOARD_Z = 40;

export function isReleaseChatKeyboardMode(input: Pick<ReleaseChatLayoutInput, 'isPhone' | 'keyboardOpen' | 'viewportHeightPx'>): boolean {
  return input.isPhone && input.keyboardOpen && input.viewportHeightPx > 0;
}

export function releaseChatLayout(input: ReleaseChatLayoutInput): ReleaseChatLayout {
  const flowHeight: CSSProperties['height'] = input.flowHeightPx ?? RELEASE_CHAT_FALLBACK_HEIGHT;

  if (!isReleaseChatKeyboardMode(input)) {
    return { mode: 'flow', slot: { height: flowHeight }, box: { height: '100%' } };
  }

  const offsetTop = Math.max(0, Math.round(input.offsetTopPx));
  const visibleHeight = Math.round(input.viewportHeightPx);
  return {
    mode: 'keyboard',
    // The slot keeps the height the box had in the page, so nothing behind the
    // pinned box reflows (or changes the scroll position) while typing.
    slot: { height: flowHeight },
    box: {
      position: 'fixed',
      left: 0,
      right: 0,
      // The top of what can be seen, below the status bar when the page runs
      // under it (viewportFit: cover; 0 in Safari's own portrait chrome).
      top: `calc(${offsetTop}px + env(safe-area-inset-top, 0px))`,
      // Ends exactly where the visible region ends: the top of the keyboard.
      height: `calc(${visibleHeight}px - env(safe-area-inset-top, 0px))`,
      zIndex: RELEASE_CHAT_KEYBOARD_Z,
    },
  };
}
