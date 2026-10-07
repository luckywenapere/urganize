/**
 * When a menu item's tip appears, as pure rules (founder ask, 2026-10-07: the
 * page tips move off the page titles and onto the menu items, shown on hover).
 *
 * The numbers follow the established research and the libraries built on it:
 *
 *  - OPEN DELAY 500ms. Nielsen Norman Group's tooltip guidance is to wait about
 *    half a second, so a pointer passing over a row on its way somewhere else
 *    does not flash a panel; shorter and every sweep across the bar sets off a
 *    strobe, longer and people think there is no tip at all. Material's tooltip
 *    sits at the same 500ms, Radix defaults to 700ms.
 *  - WARM WINDOW 300ms. Once someone has shown they want tips (one has opened),
 *    moving to the next item shows its tip at once, the way macOS and Radix's
 *    `skipDelayDuration` behave. Making a person wait half a second again for
 *    each neighbour reads as lag, not care.
 *  - Keyboard focus shows the tip at once: a keyboard user arrived on purpose.
 *  - Closing is instant: a tip left on screen after the pointer has gone covers
 *    the next thing someone wants to read.
 */

export const NAV_TIP_OPEN_DELAY_MS = 500;
export const NAV_TIP_WARM_WINDOW_MS = 300;

/**
 * How long to wait before showing a tip.
 *
 * `lastClosedAt` is when a tip last closed (null when none has shown yet), and
 * `tipOpen` says whether one is on screen right now (moving between items).
 */
export function navTipDelay({
  now,
  lastClosedAt,
  tipOpen,
  viaKeyboard,
}: {
  now: number;
  lastClosedAt: number | null;
  tipOpen: boolean;
  viaKeyboard: boolean;
}): number {
  if (viaKeyboard || tipOpen) return 0;
  if (lastClosedAt !== null && now - lastClosedAt >= 0 && now - lastClosedAt < NAV_TIP_WARM_WINDOW_MS) {
    return 0;
  }
  return NAV_TIP_OPEN_DELAY_MS;
}

/**
 * On a phone there is no hover, so a tip opens on a PRESS AND HOLD, the way
 * Android and Material show a tooltip on touch (founder ask, 2026-10-07: tips on
 * phone too). A quick tap still just goes to the page.
 *
 *  - HOLD 500ms: Android's own long-press timeout, the length people's thumbs
 *    already know from every app on the phone.
 *  - LINGER 1500ms: Material's mobile tooltip stays about a second and a half
 *    after the finger lifts, long enough to read two short sentences.
 *  - MOVE TOLERANCE 10px: past this the finger is scrolling, not holding.
 */
export const NAV_TIP_LONG_PRESS_MS = 500;
export const NAV_TIP_TOUCH_LINGER_MS = 1500;
export const NAV_TIP_MOVE_TOLERANCE_PX = 10;

/** True once a held finger has moved far enough to count as a scroll. */
export function touchMovedTooFar(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > NAV_TIP_MOVE_TOLERANCE_PX;
}
