'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * On-screen-keyboard state, measured once for the whole app.
 *
 * Two platforms, two signals, and BOTH are needed — this is the reason the
 * module exists rather than each surface rolling its own check:
 *
 *  - Android Chrome honours `interactiveWidget: 'resizes-content'` (set in
 *    app/layout.tsx), so opening the keyboard SHRINKS the layout viewport.
 *    `100dvh` shrinks with it and the only signal available is "the viewport
 *    got materially shorter than it was" — hence the baseline comparison.
 *  - iOS Safari ignores that hint entirely: the layout viewport keeps its
 *    full height and the keyboard simply COVERS the bottom of it. `100dvh`
 *    does not move, so a bottom-pinned composer ends up floating above a
 *    band of dead space with the keyboard beneath it. The signal there is
 *    the gap between the layout viewport and the visual viewport.
 *
 * `viewportHeightPx` is the visual viewport's height — the region the user
 * can actually see. Surfaces that lock themselves to the viewport read it
 * (via the `--app-viewport-height` custom property KeyboardViewportBridge
 * publishes) INSTEAD of doing arithmetic against `100dvh`, because on iOS
 * those two numbers disagree by exactly the keyboard.
 */
export type KeyboardViewportState = {
  /** True while the keyboard covers enough of the screen to matter. */
  open: boolean;
  /** Visual viewport height in px — 0 before the first client measurement. */
  viewportHeightPx: number;
  /**
   * How much of the LAYOUT viewport's bottom is not visible, in px. ~0 on
   * Android (the layout viewport shrinks instead); on iOS it is the keyboard
   * minus however far the page has already been panned. This is what a
   * `position: fixed; bottom: 0` surface has to be lifted by, since `fixed`
   * anchors to the layout viewport, not to what the user can see.
   */
  insetPx: number;
  /**
   * How far the visible region has been panned down the layout viewport, in
   * px. Non-zero only on iOS, and only when it could not scroll the document
   * far enough to reveal the focused field. A `position: fixed` box has to
   * add this to its `top` or it renders above the visible region entirely.
   */
  offsetTopPx: number;
};

// How far the viewport has to shrink before we call it "the keyboard is
// open" rather than a rotation or a browser chrome change. 150px comfortably
// clears both without needing a device/UA check. (Carried over verbatim from
// MobileNavBar's original local hook, which this module replaces.)
const KEYBOARD_SHRINK_THRESHOLD_PX = 150;

// The iOS signal: how much of the layout viewport the visual viewport no
// longer covers. Browser chrome never accounts for this much, so anything
// past it is a keyboard.
const KEYBOARD_OVERLAP_THRESHOLD_PX = 120;

const INITIAL_STATE: KeyboardViewportState = {
  open: false,
  viewportHeightPx: 0,
  insetPx: 0,
  offsetTopPx: 0,
};

// Snapshot identity must be stable between reads or useSyncExternalStore
// loops — a new object is minted only when a value actually changed.
let snapshot: KeyboardViewportState = INITIAL_STATE;
const listeners = new Set<() => void>();
let baselineHeight = 0;
let baselineWidth = 0;
let listening = false;

function readViewportHeight(): number {
  return Math.round(window.visualViewport?.height ?? window.innerHeight);
}

function readLayoutHeight(): number {
  return document.documentElement.clientHeight || window.innerHeight;
}

function measure(): KeyboardViewportState {
  const viewport = window.visualViewport;
  const width = window.innerWidth;
  const height = readViewportHeight();
  const offsetTop = viewport ? Math.max(0, Math.round(viewport.offsetTop)) : 0;

  if (width !== baselineWidth) {
    // Orientation or window resize, not a keyboard — re-baseline instead of
    // reading it as a shrink.
    baselineWidth = width;
    baselineHeight = height;
    return { open: false, viewportHeightPx: height, insetPx: 0, offsetTopPx: 0 };
  }
  // The viewport only ever grows back to (or past) its resting height when
  // nothing is covering it, so the tallest height seen is the baseline.
  if (height > baselineHeight) baselineHeight = height;

  // DETECTION IS SCROLL-INDEPENDENT ON PURPOSE. It compares heights only —
  // never `offsetTop`. When iOS cannot scroll the document far enough to
  // reveal the focused field it PANS the visual viewport instead, and an
  // offset-adjusted overlap collapses to ~0 at full pan. Reading that as
  // "keyboard closed" made the column snap back to full height, which
  // re-hid the field, which made iOS pan again — an oscillation that showed
  // up as MORE dead space, not less. Heights don't move when the page pans.
  const shrank = baselineHeight - height > KEYBOARD_SHRINK_THRESHOLD_PX;
  const covered = readLayoutHeight() - height > KEYBOARD_OVERLAP_THRESHOLD_PX;
  const open = shrank || covered;
  if (!open) return { open, viewportHeightPx: height, insetPx: 0, offsetTopPx: 0 };

  // Both of these DO account for the pan — they are screen coordinates for a
  // `position: fixed` box, which anchors to the layout viewport.
  const inset = Math.max(0, readLayoutHeight() - height - offsetTop);
  return { open, viewportHeightPx: height, insetPx: inset, offsetTopPx: offsetTop };
}

function handleViewportChange() {
  const next = measure();
  if (
    next.open === snapshot.open &&
    next.viewportHeightPx === snapshot.viewportHeightPx &&
    next.insetPx === snapshot.insetPx &&
    next.offsetTopPx === snapshot.offsetTopPx
  ) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!listening) {
    listening = true;
    baselineWidth = window.innerWidth;
    baselineHeight = readViewportHeight();
    snapshot = measure();
    window.addEventListener('resize', handleViewportChange);
    // `scroll` matters on iOS: the visual viewport can slide within the
    // layout viewport without either resizing, which changes the overlap.
    window.visualViewport?.addEventListener('resize', handleViewportChange);
    window.visualViewport?.addEventListener('scroll', handleViewportChange);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    listening = false;
    window.removeEventListener('resize', handleViewportChange);
    window.visualViewport?.removeEventListener('resize', handleViewportChange);
    window.visualViewport?.removeEventListener('scroll', handleViewportChange);
  };
}

/**
 * Live keyboard/viewport state. `useSyncExternalStore` rather than a
 * state+effect pair for the same reason `useIsDesktopViewport` uses it: the
 * measurement stays out of render, and the server snapshot is a stable
 * "closed" so SSR and the first client paint agree.
 */
export function useKeyboardViewport(): KeyboardViewportState {
  const getSnapshot = useCallback(() => snapshot, []);
  const getServerSnapshot = useCallback(() => INITIAL_STATE, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** True while the on-screen keyboard is covering the bottom of the screen. */
export function useKeyboardOpen(): boolean {
  return useKeyboardViewport().open;
}
