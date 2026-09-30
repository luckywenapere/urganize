/**
 * The one floor both chrome columns respect.
 *
 * WHY THIS IS ITS OWN MODULE. The UrgAns rail and the workspace side menu are
 * both flex SIBLINGS of `<main>`, both draggable, and each one's maximum is
 * computed against whatever the other is currently taking — so the number that
 * says "and this much is left for the work" has to be ONE number. It lived
 * privately inside lib/rail-width.ts while the rail was the only draggable
 * column; a second copy in lib/sidebar-width.ts is exactly the drift this repo
 * keeps having to correct (four copies of getAccessToken, four of the
 * four-flag scene expression, two of isRecapEligible).
 */

/**
 * What `<main>` keeps no matter what.
 *
 * Below this the workspace stops being a workspace, which is not a trade a
 * width control should be able to make: two release scenes swap layout on
 * CONTAINER queries of that centre column (the content calendar at 45rem, the
 * timeline at 34rem), so a column dragged too wide silently degrades a week
 * grid into the phone list on a desktop.
 */
export const MAIN_MINIMUM = 560;

/**
 * THE WIDTH BUDGET. Everything below exists so the arithmetic that decides
 * "does the centre column still have room for a week grid" lives in one place a
 * test can hold. The right-hand column and the side menu are flex siblings of
 * `<main>`; every pixel they take comes out of it, and two release scenes swap
 * layout on CONTAINER queries of what is left.
 */

/** AppShell's `mx-auto max-w-[1440px]` — the ONLY place page width is decided. */
export const APP_FRAME_MAX_WIDTH = 1440;

/** `<main>`'s `lg:px-8`, both sides. */
export const MAIN_HORIZONTAL_PADDING = 64;

/**
 * The centre column's width at which each scene stops being a grid and becomes
 * a list. They are the pixel values of the container queries in globals.css —
 * `.cc-scene-container` at 45rem and `.tl-scene-container` at 34rem — and must
 * move with them.
 */
export const CALENDAR_GRID_MIN_WIDTH = 720;
export const TIMELINE_GRID_MIN_WIDTH = 544;

/** `.app-layout`'s side padding at lg and up: `clamp(24px, 3vw, 56px)`. */
export function appLayoutGutter(viewportWidth: number): number {
  return Math.min(56, Math.max(24, viewportWidth * 0.03));
}

/** How wide the app frame actually is: the viewport less a gutter each side,
 *  never wider than the frame's cap. Non-finite input is an unknown viewport
 *  and reads as no frame at all. */
export function appFrameWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth)) return 0;
  return Math.max(
    0,
    Math.min(APP_FRAME_MAX_WIDTH, viewportWidth - 2 * appLayoutGutter(viewportWidth))
  );
}

/**
 * What `<main>` has to work with: the frame, less the two side columns (pass
 * each with its gutters — sidebarTotalWidth and railColumnTotal build them) and
 * its own padding. This is the number the scenes' container queries see.
 */
export function mainContentWidth(input: {
  viewportWidth: number;
  leftColumnTotal: number;
  rightColumnTotal: number;
}): number {
  return Math.max(
    0,
    appFrameWidth(input.viewportWidth) -
      input.leftColumnTotal -
      input.rightColumnTotal -
      MAIN_HORIZONTAL_PADDING
  );
}
