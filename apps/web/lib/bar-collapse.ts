// When the phone's bottom bar folds away (2026-10-04, founder call).
//
// The bar shrinks to one round button while a person scrolls DOWN a page. It
// opens again ONLY at the very top of the page or when the round button is
// tapped (2026-10-17, founder call: "The only way the menu can open back is
// when they scroll to the top or they click it"). Scrolling up partway leaves
// it folded; it opened on any scroll up until then. It must only ever react to a real scroll: a short
// page that cannot scroll, a rubber-band stretch past either end that the phone
// draws when you drag a page that has nothing to scroll, and the UrgAns chat,
// where the composer sits at the bottom and the bar folding looks like a glitch.
// This file is the rule; BottomBar only feeds it measurements.

/** A page has to overflow by more than this to count as scrollable at all. */
export const MIN_SCROLLABLE_PX = 64;
/** Movement smaller than this is a wobble of the thumb, not a scroll. */
export const SCROLL_STEP_PX = 12;
/** At the very top the bar is always open; this is the only scroll that opens it. */
export const TOP_ZONE_PX = 24;

/** The one page where the bar never folds: the chat. */
export function barNeverCollapsesOn(pathname: string): boolean {
  return pathname === '/dashboard/urgans' || pathname.startsWith('/dashboard/urgans/');
}

export type ScrollReading = {
  /** Current scroll offset of the element that scrolled. */
  top: number;
  /** The offset when the bar last reacted. */
  previous: number;
  scrollHeight: number;
  clientHeight: number;
};

/**
 * The bar's next state, or null to leave it alone.
 * true = fold, false = open. Only reaching the top opens it; a scroll up that
 * stops short of the top leaves it as it is.
 */
export function nextBarCollapsed(reading: ScrollReading): boolean | null {
  const { top, previous, scrollHeight, clientHeight } = reading;
  const room = scrollHeight - clientHeight;
  // Nothing to scroll away from: a stretch or swipe on a short page is not a scroll.
  if (room <= MIN_SCROLLABLE_PX) return null;
  // Rubber-banding past either end reports offsets outside the real range.
  if (top < 0 || top > room) return null;
  if (top <= TOP_ZONE_PX) return false;
  const delta = top - previous;
  if (delta > SCROLL_STEP_PX) return true;
  return null;
}
