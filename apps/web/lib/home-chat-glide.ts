/**
 * The Home chat box gliding into the full chat, done with plain CSS on the
 * live page rather than the browser's View Transitions API.
 *
 * Why not View Transitions (tried in v1.85.0, removed): the browser shows a
 * frozen picture of the old page until the new one has rendered, and a Next.js
 * navigation to the chat page waits on a server round trip first. People saw
 * Home freeze, then the chat appear with no animation at all. This version
 * never freezes: the box slides down and the rest of Home fades WHILE the chat
 * page loads, and the chat fades in when it arrives.
 */

/** The class on <html> that fades Home while the box slides (globals.css). */
export const LEAVING_CLASS = 'urgans-leaving';
/** Marks the Home box so the fade rule leaves it alone. */
export const SOURCE_ATTRIBUTE = 'data-urgans-source';
/** How long the slide takes, in ms. Matches --motion-slow. */
export const GLIDE_MS = 300;
/** An arrival mark older than this was not this navigation. */
const ARRIVAL_WINDOW_MS = 5000;

/**
 * Pure: how far the box should move to sit where the chat's composer sits,
 * a little above the bottom of the screen. Not at all while the keyboard is
 * open: the box is riding on the keyboard, and the chat's composer will be too.
 */
export function glideOffset(input: {
  boxBottom: number;
  viewportHeight: number;
  bottomGap: number;
  keyboardOpen?: boolean;
}): number {
  if (input.keyboardOpen) return 0;
  const target = input.viewportHeight - input.bottomGap;
  return Math.round(target - input.boxBottom);
}

/** Pure: the gap the chat composer keeps below it at this width. */
export function composerBottomGap(viewportWidth: number): number {
  // Below lg the bottom bar sits under the composer.
  return viewportWidth >= 1024 ? 24 : 88;
}

let arrivingAt: number | null = null;

/** Home calls this just before it navigates to the chat. */
export function markArrivingFromHome(now: number = Date.now()): void {
  arrivingAt = now;
}

/** The chat page calls this once: true if it was opened by the glide. */
export function consumeArrivingFromHome(now: number = Date.now()): boolean {
  const at = arrivingAt;
  arrivingAt = null;
  return at !== null && now - at >= 0 && now - at <= ARRIVAL_WINDOW_MS;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
