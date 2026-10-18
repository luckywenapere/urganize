/**
 * The app's one motion system for changes of screen (founder ask, Oct 18,
 * 2026: "I want although subtly it to look like the screen is morphing not
 * jumping"). Three tools, each the smallest that does its job:
 *
 *  1. `morphUpdate(update)`: a same-document change we control (a rollout
 *     scene opening or closing, the UrgAns column following the keyboard) runs
 *     inside the View Transitions API, so what did not change stays perfectly
 *     still and what did change crossfades or glides into place. Supported on
 *     iOS 18+ (the app's WKWebView) and Chromium; elsewhere `update` simply
 *     runs and `fadeIn` below is the fallback.
 *  2. `fadeIn(element)`: a 180ms opacity-only entrance for content that arrived
 *     without a view transition (a route change, or a browser without the API).
 *     Opacity only, never transform: a transform on an ancestor anchors every
 *     `position: fixed` child to it (lib/fixed-containing-block-guard.test.ts).
 *  3. Enter/exit classes in globals.css (`morph-sheet-*`, `morph-pop`) for the
 *     sheets and pop-overs, kept mounted for their exit by
 *     components/motion/usePresence.ts.
 *
 * Everything is instant under prefers-reduced-motion. Nothing here runs after
 * a browser Back/Forward (the iOS edge swipe already animated the page; a fade
 * on top of it would read as a flash), see `cameFromHistory`.
 */

/** The shared easing and length, the same as --motion-out / --motion-base. */
export const MORPH_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
export const MORPH_MS = 180;
/** How long a closing sheet or pop-over stays mounted for its exit. */
export const MORPH_EXIT_MS = 200;
/** A pop-over's exit is shorter: it is small and close to the finger. */
export const MORPH_POP_EXIT_MS = 120;

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type ViewTransitionLike = { finished: Promise<void> };
type DocumentWithViewTransition = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => ViewTransitionLike;
};

export function canViewTransition(): boolean {
  if (typeof document === 'undefined') return false;
  return typeof (document as DocumentWithViewTransition).startViewTransition === 'function' && !prefersReducedMotion();
}

// Back/Forward. Tracked once, at module load in the browser.
let lastPopstateAt = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    lastPopstateAt = Date.now();
  });
}

/** True right after a browser Back/Forward (an iOS edge swipe included). */
export function cameFromHistory(now: number = Date.now()): boolean {
  return now - lastPopstateAt < 800;
}

/** True while a view transition is animating; the fallback fade stays out of it. */
export function isMorphing(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.morphing === 'true';
}

let pendingCommit: (() => void) | null = null;

/**
 * Run `update` inside a view transition. `update` may trigger a React render
 * that commits a moment later (a shallow URL write): pass `awaitCommit` and
 * have the component that reacts call `morphCommitted()` from a layout effect,
 * so the new snapshot is taken from the finished screen. The wait is capped
 * (`timeoutMs`), so a slow render never holds the screen still for long.
 */
export function morphUpdate(
  update: () => void,
  options: { awaitCommit?: boolean; timeoutMs?: number } = {}
): void {
  if (!canViewTransition()) {
    update();
    return;
  }
  const root = document.documentElement;
  const timeoutMs = options.timeoutMs ?? 240;
  try {
    const transition = (document as DocumentWithViewTransition).startViewTransition!(() => {
      root.dataset.morphing = 'true';
      update();
      if (!options.awaitCommit) return;
      return new Promise<void>((resolve) => {
        const finish = () => {
          if (pendingCommit === finish) pendingCommit = null;
          resolve();
        };
        pendingCommit = finish;
        window.setTimeout(finish, timeoutMs);
      });
    });
    transition.finished.finally(() => {
      delete root.dataset.morphing;
    });
  } catch {
    delete root.dataset.morphing;
    update();
  }
}

/** The change `morphUpdate` is waiting on has committed to the DOM. */
export function morphCommitted(): void {
  const finish = pendingCommit;
  pendingCommit = null;
  finish?.();
}

/**
 * The fallback entrance: opacity 0 to 1 over 180ms. Skipped with reduced
 * motion, after Back/Forward, and while a view transition already carries the
 * change. Returns whether it ran (tests and callers that care).
 */
export function fadeIn(element: HTMLElement | null, durationMs: number = MORPH_MS): boolean {
  if (!element || typeof element.animate !== 'function') return false;
  if (prefersReducedMotion() || cameFromHistory() || isMorphing()) return false;
  element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: durationMs, easing: MORPH_EASING });
  return true;
}
