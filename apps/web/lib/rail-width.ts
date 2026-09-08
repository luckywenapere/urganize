/**
 * How wide the UrgAns side rail is allowed to be, and what a drag does to it.
 *
 * WHY THIS IS A MODULE AND NOT TEN LINES IN THE COMPONENT. The rail is a flex
 * SIBLING of <main> rather than an overlay, so every pixel it takes comes out
 * of the release view — and two scenes swap layout on CONTAINER queries of
 * that centre column (the content calendar at 45rem, the timeline at 34rem).
 * A rail somebody dragged too wide silently degrades a week grid into a phone
 * list on a desktop. The bounds below are what stop that being a surprise.
 *
 * Everything here is pure: vitest collects lib/**\/*.test.ts and this repo has
 * no component tests, so the decisions live where they can be held.
 */

/** Below the composer and the transcript stop being usable. */
export const MIN_RAIL_WIDTH = 320;

/**
 * The absolute ceiling, regardless of how much monitor there is.
 *
 * A 1200px conversation column is not better than a 720px one, it is only
 * wider — the same call the app makes about line length everywhere else.
 */
export const MAX_RAIL_WIDTH = 720;

/** Roughly what `clamp(360px, 31vw, 460px)` resolved to on a laptop, so an
 *  account that never drags sees close to what it saw before. */
export const DEFAULT_RAIL_WIDTH = 420;

export const RAIL_WIDTH_KEY = 'urganize.chappi.rail-width';
export const RAIL_WIDTH_VERSION = 1;

/** Arrow keys, and the same with shift held. */
export const RAIL_KEYBOARD_STEP = 16;
export const RAIL_KEYBOARD_STEP_LARGE = 64;

/** What <main> keeps no matter what. Below this the workspace stops being a
 *  workspace, which is not a trade a width control should be able to make. */
const MAIN_MINIMUM = 560;

/** WorkspaceIdentityPanel's 240px plus its mr-8. */
const IDENTITY_PANEL_TOTAL = 272;

/** The rail's own mr-8. */
const RAIL_GUTTER = 32;

/** Tailwind's lg. The rail is `hidden lg:block`, so there is nothing to drag
 *  below it — asserted rather than assumed, because the handle must not exist
 *  on a phone. */
const LG_BREAKPOINT = 1024;

export type RailBounds = {
  min: number;
  max: number;
  /** False when the handle should not be offered at all: below lg, or on a
   *  viewport too small to satisfy both minimums. A control that cannot move
   *  is worse than no control. */
  resizable: boolean;
};

export function isRailResizable(viewportWidth: number): boolean {
  return Number.isFinite(viewportWidth) && viewportWidth >= LG_BREAKPOINT;
}

/**
 * NOTE ON `hasIdentityPanel`: the caller decides this, not us, because
 * WorkspaceIdentityPanel hides ITSELF between lg and xl whenever the rail is
 * open (`railIsCompeting`). Reserving its width in that band would compute the
 * maximum against a column that is not on screen.
 */
export function resolveRailBounds(
  viewportWidth: number,
  hasIdentityPanel: boolean
): RailBounds {
  const locked: RailBounds = { min: MIN_RAIL_WIDTH, max: MIN_RAIL_WIDTH, resizable: false };
  if (!isRailResizable(viewportWidth)) return locked;

  const reserved = MAIN_MINIMUM + RAIL_GUTTER + (hasIdentityPanel ? IDENTITY_PANEL_TOTAL : 0);
  const available = Math.floor(viewportWidth - reserved);
  const max = Math.min(MAX_RAIL_WIDTH, available);

  if (!Number.isFinite(max) || max < MIN_RAIL_WIDTH) return locked;
  return { min: MIN_RAIL_WIDTH, max, resizable: true };
}

export function clampRailWidth(width: number, bounds: RailBounds): number {
  const candidate = Number.isFinite(width) ? Math.round(width) : DEFAULT_RAIL_WIDTH;
  return Math.min(bounds.max, Math.max(bounds.min, candidate));
}

/**
 * The storage validator. Checked against the ABSOLUTE range rather than the
 * current viewport's: a width saved on a big monitor is legitimate, and gets
 * clamped to today's bounds when it is applied.
 */
export function parsePersistedRailWidth(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < MIN_RAIL_WIDTH || rounded > MAX_RAIL_WIDTH) return null;
  return rounded;
}

/**
 * THE HANDLE IS THE RAIL'S LEFT EDGE, so moving the pointer LEFT makes the
 * rail WIDER. Reversing this is the most obvious way for the whole feature to
 * feel broken, which is why it has its own test.
 */
export function railWidthFromDrag(
  startWidth: number,
  startX: number,
  currentX: number,
  bounds: RailBounds
): number {
  if (!Number.isFinite(startX) || !Number.isFinite(currentX)) {
    return clampRailWidth(startWidth, bounds);
  }
  return clampRailWidth(startWidth + (startX - currentX), bounds);
}
