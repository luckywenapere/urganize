/**
 * How wide the workspace side menu is allowed to be, and what a drag does
 * to it.
 *
 * The mirror of lib/rail-width.ts, and deliberately a SEPARATE module rather
 * than one parameterised by which side it is on. The two columns share a floor
 * (MAIN_MINIMUM) and nothing else: they sit on opposite edges, so their drags
 * run in opposite directions; their ranges differ because a nav column and a
 * conversation column want different amounts of room; and only this one has a
 * collapsed state. A "which edge" flag threaded through every function is how
 * the direction gets reversed by accident, which is the one failure the rail's
 * own module singles out for a test.
 *
 * Everything here is pure: vitest collects lib/**\/*.test.ts and this repo has
 * no component tests, so the decisions live where they can be held.
 */

import { MAIN_MINIMUM } from './layout-columns';

/**
 * Below this the nav stops working as a nav. Every row is icon + label inside
 * the card's padding, so shrinking past roughly this point leaves the labels
 * truncated to a couple of characters — at which point the expanded card is a
 * worse version of the collapsed icon rail it already offers.
 */
export const MIN_SIDEBAR_WIDTH = 208;

/**
 * The absolute ceiling, however much monitor there is. A nav column wider than
 * this is not more readable, only wider — the same call the rail makes about
 * its own conversation width, and the same one this app makes about line
 * length everywhere else.
 */
export const MAX_SIDEBAR_WIDTH = 420;

/** The fixed `w-[240px]` this card carried before it was draggable, so an
 *  account that never touches the handle sees exactly what it saw before. */
export const DEFAULT_SIDEBAR_WIDTH = 240;

/**
 * The collapsed icon rail's `w-16`. NOT a bound: a collapsed card is not
 * resizable at all (64px has no room for a label to grow into), so this exists
 * only so the rail can reserve the right amount of space for a collapsed
 * neighbour.
 */
export const COLLAPSED_SIDEBAR_WIDTH = 64;

export const SIDEBAR_WIDTH_KEY = 'urganize.workspace.sidebar-width';
export const SIDEBAR_WIDTH_VERSION = 1;

/** Unchanged from when this lived in the component — an existing account's
 *  collapsed choice has to survive the move into the store. */
export const SIDEBAR_COLLAPSED_KEY = 'urganize.workspace.sidebar-collapsed';
export const SIDEBAR_COLLAPSED_VERSION = 1;

/** Arrow keys, and the same with shift held. Same steps as the rail: they are
 *  a property of a keyboard, not of which column is being resized. */
export const SIDEBAR_KEYBOARD_STEP = 16;
export const SIDEBAR_KEYBOARD_STEP_LARGE = 64;

/**
 * The card's own `ml-8` + `mr-8`. BOTH are real horizontal space — the left
 * one insets the card from the page edge to line up with the topbar's own
 * `lg:px-8`, the right one is the gap before `<main>` — so a reservation that
 * counts only one is 32px short. lib/rail-width.ts's old constant counted only
 * the `mr-8` and was short by exactly that, which is fixed by everything now
 * going through sidebarTotalWidth below.
 */
export const SIDEBAR_GUTTERS = 64;

/** Tailwind's lg. The card is hidden below it, so there is nothing to drag
 *  there — asserted rather than assumed, because the handle must not exist on
 *  a phone. */
const LG_BREAKPOINT = 1024;

export type SidebarBounds = {
  min: number;
  max: number;
  /** False when the handle should not be offered at all: below lg, or on a
   *  viewport too small to satisfy every minimum at once. A control that
   *  cannot move is worse than no control. */
  resizable: boolean;
};

export function isSidebarResizable(viewportWidth: number): boolean {
  return Number.isFinite(viewportWidth) && viewportWidth >= LG_BREAKPOINT;
}

/**
 * What the card plus its margins takes out of the row right now — the number
 * the rail reserves.
 *
 * Collapsed wins over the stored width, because a collapsed card really is
 * 64px wide whatever the user last dragged it to. That is also what makes
 * collapsing the menu widen the rail's ceiling, which is the same "collapsing
 * is the user's own fix for the squeeze" the card's own comment already
 * records.
 */
export function sidebarTotalWidth(width: number, collapsed: boolean): number {
  if (collapsed) return COLLAPSED_SIDEBAR_WIDTH + SIDEBAR_GUTTERS;
  const own = Number.isFinite(width) ? Math.round(width) : DEFAULT_SIDEBAR_WIDTH;
  return own + SIDEBAR_GUTTERS;
}

/**
 * NOTE ON `railTotal`: the caller decides it, not us, and passes 0 whenever the
 * rail is not on screen — closed, flagged off, or on the assistant page where
 * it renders nowhere. Reserving a rail that is not there would compute the
 * maximum against a column nobody can see.
 *
 * The two columns therefore constrain each other, and that settles rather than
 * oscillates: every clamp only ever shrinks, so opening the rail against an
 * over-wide menu shrinks the menu, which then raises the rail's own ceiling,
 * and both come to rest with `<main>` no smaller than its floor.
 */
export function resolveSidebarBounds(
  viewportWidth: number,
  railTotal: number
): SidebarBounds {
  const locked: SidebarBounds = {
    min: MIN_SIDEBAR_WIDTH,
    max: MIN_SIDEBAR_WIDTH,
    resizable: false,
  };
  if (!isSidebarResizable(viewportWidth)) return locked;

  const rail = Number.isFinite(railTotal) ? Math.max(0, railTotal) : 0;
  const available = Math.floor(viewportWidth - MAIN_MINIMUM - SIDEBAR_GUTTERS - rail);
  const max = Math.min(MAX_SIDEBAR_WIDTH, available);

  if (!Number.isFinite(max) || max < MIN_SIDEBAR_WIDTH) return locked;
  return { min: MIN_SIDEBAR_WIDTH, max, resizable: true };
}

export function clampSidebarWidth(width: number, bounds: SidebarBounds): number {
  const candidate = Number.isFinite(width) ? Math.round(width) : DEFAULT_SIDEBAR_WIDTH;
  return Math.min(bounds.max, Math.max(bounds.min, candidate));
}

/**
 * The storage validator. Checked against the ABSOLUTE range rather than the
 * current viewport's: a width saved on a big monitor is legitimate, and gets
 * clamped to today's bounds when it is applied.
 */
export function parsePersistedSidebarWidth(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < MIN_SIDEBAR_WIDTH || rounded > MAX_SIDEBAR_WIDTH) return null;
  return rounded;
}

/**
 * THE HANDLE IS THE CARD'S RIGHT EDGE, so moving the pointer RIGHT makes the
 * menu WIDER — the exact opposite sign from the rail, whose handle is on its
 * left edge. Getting this backwards is the most obvious way for the whole
 * control to feel broken, and the two modules disagreeing about it is the
 * reason they are not one parameterised module. Hence its own test.
 */
export function sidebarWidthFromDrag(
  startWidth: number,
  startX: number,
  currentX: number,
  bounds: SidebarBounds
): number {
  if (!Number.isFinite(startX) || !Number.isFinite(currentX)) {
    return clampSidebarWidth(startWidth, bounds);
  }
  return clampSidebarWidth(startWidth + (currentX - startX), bounds);
}
