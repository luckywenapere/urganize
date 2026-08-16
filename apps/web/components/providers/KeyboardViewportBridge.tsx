'use client';

import { useEffect } from 'react';
import { useKeyboardViewport } from '@/lib/keyboard-viewport';

/**
 * Publishes the on-screen keyboard's state to CSS, so viewport-locked
 * surfaces can react to it without every one of them subscribing to
 * `visualViewport` itself. Mounted once by AppShell; renders nothing.
 *
 * Two things land on `<html>` while the keyboard is up:
 *  - `data-keyboard-open="true"` — the selector hook. Used to reclaim space
 *    reserved for chrome that hides itself when the keyboard opens (the
 *    mobile tab bar), which would otherwise stay as dead space.
 *  - `--app-viewport-height` — the visible region's height in px. On iOS
 *    `100dvh` does NOT shrink for the keyboard, so a `calc()` against it
 *    leaves the composer floating above the keyboard with a band of nothing
 *    between them (the bug this fixes). This value is measured, not derived.
 *  - `--app-keyboard-inset` — how far a `position: fixed; bottom: 0`
 *    surface has to be lifted to clear the keyboard, which is NOT the same
 *    question: `fixed` anchors to the layout viewport, and on iOS that
 *    viewport's bottom is behind the keyboard.
 *  - `--app-visual-top` — how far the visible region has been panned down
 *    the layout viewport. iOS pans when it cannot scroll the document far
 *    enough to reveal the focused field, and a `fixed` box that ignores it
 *    renders above the screen. Zero on Android and in the common iOS case.
 *
 * Both are REMOVED when the keyboard closes rather than reset to a resting
 * value, so every layout falls back to its ordinary `100dvh` rule and the
 * keyboard-closed rendering is byte-identical to before this existed.
 */
export function KeyboardViewportBridge() {
  const { open, viewportHeightPx, insetPx, offsetTopPx } = useKeyboardViewport();

  useEffect(() => {
    const root = document.documentElement;
    if (open && viewportHeightPx > 0) {
      root.dataset.keyboardOpen = 'true';
      root.style.setProperty('--app-viewport-height', `${viewportHeightPx}px`);
      root.style.setProperty('--app-keyboard-inset', `${insetPx}px`);
      root.style.setProperty('--app-visual-top', `${offsetTopPx}px`);
    } else {
      delete root.dataset.keyboardOpen;
      root.style.removeProperty('--app-viewport-height');
      root.style.removeProperty('--app-keyboard-inset');
      root.style.removeProperty('--app-visual-top');
    }
  }, [open, viewportHeightPx, insetPx, offsetTopPx]);

  // Unmount (sign-out, a route that drops the shell) must not strand the
  // attribute — a stale "keyboard is open" would shrink the next page.
  useEffect(() => {
    return () => {
      const root = document.documentElement;
      delete root.dataset.keyboardOpen;
      root.style.removeProperty('--app-viewport-height');
    };
  }, []);

  return null;
}
