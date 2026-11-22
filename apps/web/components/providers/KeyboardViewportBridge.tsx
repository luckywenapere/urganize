'use client';

import { useKeyboardViewport } from '@/lib/keyboard-viewport';

/**
 * Keeps the on-screen keyboard measurement running for the whole app, so
 * viewport-locked surfaces can react to it from CSS without every one of them
 * subscribing to `visualViewport` itself. Mounted once by AppShell; renders
 * nothing.
 *
 * lib/keyboard-viewport.ts writes four things to `<html>` while the keyboard
 * is up, in the same animation frame as the viewport event:
 *  - `data-keyboard-open="true"`: the selector hook. Used to reclaim space
 *    reserved for chrome that hides itself when the keyboard opens.
 *  - `--app-viewport-height`: the visible region's height in px. On iOS
 *    `100dvh` does NOT shrink for the keyboard, so a `calc()` against it
 *    leaves the composer floating above the keyboard with a band of nothing
 *    between them. This value is measured, not derived.
 *  - `--app-keyboard-inset`: how far a `position: fixed; bottom: 0` surface
 *    has to be lifted to clear the keyboard. `fixed` anchors to the layout
 *    viewport, and on iOS that viewport's bottom is behind the keyboard.
 *  - `--app-visual-top`: how far the visible region has been panned down the
 *    layout viewport. On the locked phone tabs the pan is undone at once
 *    (#1374), so this stays 0 there; elsewhere a `fixed` box adds it.
 *
 * All of them are REMOVED when the keyboard closes, so every layout falls back
 * to its ordinary `100dvh` rule and the keyboard-closed rendering is unchanged.
 *
 * The keyboard flip no longer runs inside a view transition (it did from Oct
 * 18, 2026): a view transition freezes the page as a picture while iOS is
 * still sliding the keyboard and panning, which is what showed as a cut-off,
 * shifted page with the box stranded high (#1374).
 */
export function KeyboardViewportBridge() {
  useKeyboardViewport();
  return null;
}
