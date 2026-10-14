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
 *
 * That reasoning is also why a drag past this point SNAPS to the rail rather
 * than rendering the card any narrower: the expanded card is never drawn
 * between here and COLLAPSED_SIDEBAR_WIDTH, because this is exactly the range
 * in which it would be the worse of the two things it could be.
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
 * The collapsed icon rail's `w-16`.
 *
 * A REACHABLE STATE OF THE DRAG SINCE 2026-09-09 (founder call: "make it so it
 * is collapsible up until it's in collapsed view"). This used to be documented
 * as explicitly not a bound — "a collapsed card is not resizable at all" — and
 * both halves of that have reversed: the handle is offered while collapsed, and
 * a drag that crosses SIDEBAR_COLLAPSE_AT collapses the card rather than
 * stopping dead at the minimum. Recorded as a reversal rather than edited away,
 * because the old reasoning was sound and is what still keeps the card from
 * rendering at any width in between.
 *
 * It remains what the rail reserves for a collapsed neighbour — see
 * sidebarTotalWidth.
 */
export const COLLAPSED_SIDEBAR_WIDTH = 64;

/**
 * Where a drag stops being a resize and becomes a collapse, in the same
 * candidate-width units the drag itself works in.
 *
 * ONE number for both directions, deliberately: cross it moving left and the
 * card becomes the icon rail, cross it moving right and the rail comes back at
 * MIN_SIDEBAR_WIDTH. A separate expand threshold would give the control
 * hysteresis nobody asked for and two numbers to keep in step.
 *
 * It sits BELOW the minimum rather than at it, so collapsing takes a clear
 * overshoot (48px of it) instead of happening to anyone who drags the card as
 * narrow as it goes. The card is pinned at its minimum through that overshoot —
 * see MIN_SIDEBAR_WIDTH for why it is never drawn any narrower.
 */
export const SIDEBAR_COLLAPSE_AT = 160;

export const SIDEBAR_WIDTH_KEY = 'urganize.workspace.sidebar-width';
export const SIDEBAR_WIDTH_VERSION = 1;

/** Unchanged from when this lived in the component. The version went to 2
 *  when the side menu came back (URG-254, 2026-10-14): a choice saved in the
 *  pre-overhaul menu, which was deleted on 2026-10-04, should not fold the new
 *  one for someone who has never seen it. */
export const SIDEBAR_COLLAPSED_KEY = 'urganize.workspace.sidebar-collapsed';
export const SIDEBAR_COLLAPSED_VERSION = 2;

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

/** Tailwind's xl. Where an EXPANDED card comes back while the right-hand column
 *  is on screen; see `sidebarIsOnScreen`. */
const XL_BREAKPOINT = 1280;

/**
 * Whether the card is actually painted at this width, the same rule as its own
 * className: `hidden lg:block`, or `hidden xl:block` when the right-hand column
 * is competing for the row and the card is expanded (a collapsed 64px card costs
 * about 176px less, so it stays from lg).
 *
 * WHY A RULE FOR "IS IT VISIBLE". The card corrects a stored width it cannot
 * afford by writing the clamped number back to the store (and to disk). That is
 * right for a card somebody is looking at and wrong for one that is not: an
 * off-screen card is not subject to the bounds, so writing the clamp back turns
 * one visit to a narrow window into a permanently narrower menu on the next wide
 * one. It used to need the chat open at 1024 to 1279px to happen. It happens on
 * every rollout there now, because the menu-only right-hand column is enough to
 * push the card off screen. Found by looking at the layout at 1100px and then
 * back at 1440.
 *
 * Not reading the viewport the way a media query does: `clientWidth` leaves out
 * a classic scrollbar, so within about 15px of a breakpoint this can say "off
 * screen" for a card that is showing. That only skips the write-back, which the
 * next resize fixes, and it can never say "on screen" for a card that is hidden.
 */
export function sidebarIsOnScreen(
  viewportWidth: number,
  input: { competing: boolean; collapsed: boolean }
): boolean {
  if (!Number.isFinite(viewportWidth)) return false;
  const breakpoint = input.competing && !input.collapsed ? XL_BREAKPOINT : LG_BREAKPOINT;
  return viewportWidth >= breakpoint;
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
 * What the card is doing: the icon rail, or expanded at a width.
 *
 * A COLLAPSED STATE CARRIES NO WIDTH, and that is the point of the union rather
 * than a `{ collapsed, width }` pair. The width the user dragged to has to
 * survive a collapse — expanding restores it rather than the default (see the
 * store's own note) — so a collapsed result that carried a width would be the
 * one shape able to clobber it. This one cannot.
 */
export type SidebarState =
  | { collapsed: true }
  | { collapsed: false; width: number };

/**
 * THE HANDLE IS THE CARD'S RIGHT EDGE, so moving the pointer RIGHT makes the
 * menu WIDER — the exact opposite sign from the rail, whose handle is on its
 * left edge. Getting this backwards is the most obvious way for the whole
 * control to feel broken, and the two modules disagreeing about it is the
 * reason they are not one parameterised module. Hence its own test.
 *
 * The drag tracks ONE continuous candidate width and derives the rendered state
 * from it, which is what lets the same gesture run from the maximum all the way
 * into the rail and back out without any mode of its own. `start` is where the
 * card was when the pointer went down — for a collapsed card that is the rail's
 * own 64px, i.e. what is actually on screen, so the gesture starts from where
 * the user is looking rather than from a stored width they cannot see.
 */
export function sidebarStateFromDrag(
  start: SidebarState,
  startX: number,
  currentX: number,
  bounds: SidebarBounds
): SidebarState {
  // Unchanged rather than clamped: clamping the rail's 64 would land on the
  // minimum and silently expand a card nobody touched.
  if (!Number.isFinite(startX) || !Number.isFinite(currentX)) return start;

  const startWidth = start.collapsed ? COLLAPSED_SIDEBAR_WIDTH : start.width;
  const candidate = startWidth + (currentX - startX);
  if (candidate < SIDEBAR_COLLAPSE_AT) return { collapsed: true };
  return { collapsed: false, width: clampSidebarWidth(candidate, bounds) };
}

/**
 * One arrow-key step, including crossing into and out of the rail — the
 * keyboard twin of the drag's own threshold crossing. Without it the collapse
 * gesture would be reachable with a pointer and not without one, on a control
 * that is deliberately keyboard-operable everywhere else.
 *
 * It does not reuse SIDEBAR_COLLAPSE_AT's overshoot: a keypress is deliberate
 * where a drag can be a slip, so one step narrower than the minimum is enough
 * to mean it.
 */
export function sidebarStateFromStep(
  current: SidebarState,
  delta: number,
  bounds: SidebarBounds
): SidebarState {
  if (current.collapsed) {
    // Only widening does anything: there is nothing narrower than the rail.
    return delta > 0 ? { collapsed: false, width: bounds.min } : current;
  }
  const next = current.width + delta;
  if (next < bounds.min) return { collapsed: true };
  return { collapsed: false, width: clampSidebarWidth(next, bounds) };
}
