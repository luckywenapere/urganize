/**
 * Where a help pullout goes, given its trigger and the viewport.
 *
 * WHY THIS EXISTS AT ALL, rather than a CSS-positioned panel next to the
 * trigger: both surfaces that needed it clip their own children.
 *
 *  - The side menu's nav list is `min-h-0 flex-1 overflow-y-auto`, so a panel
 *    wider than the 240px card is cut off at the card's edge.
 *  - Every metadata step card is `overflow-hidden rounded-xl`, so a panel
 *    hanging below a field near the bottom of a card is cut off there.
 *
 * So the panel is `position: fixed` and portaled to `document.body`, which also
 * clears the two containing-block traps this codebase has already recorded:
 * AppShell's `lazy-fade` transform breaks `fixed` for every descendant (the
 * reason DeleteReleaseDialog portals), and MobileNavBar's `backdrop-blur-xl`
 * does the same for anything inside it. Portaling to the body escapes both,
 * and then nothing in the layout knows where to put the panel. This function
 * is that decision.
 *
 * It is pure and lives here because vitest runs node-only in this repo with no
 * jsdom, so placement logic inside the component would be untestable.
 */

export type HelpTipRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type HelpTipSize = { width: number; height: number };

export type HelpTipViewport = { width: number; height: number };

/** Which side of the trigger the panel ended up on. Returned so the component
 * can animate from the right direction rather than guessing. */
export type HelpTipPlacement = 'top' | 'bottom' | 'left' | 'right';

export type PlacedHelpTip = {
  top: number;
  left: number;
  placement: HelpTipPlacement;
};

/** Breathing room between the trigger and the panel. */
export const HELP_TIP_GAP = 8;

/** How close the panel may come to the edge of the screen. Keeps it clear of a
 * phone's rounded corners and of the scrollbar gutter on a desktop. */
export const HELP_TIP_VIEWPORT_MARGIN = 12;

/** Clamp, but never below zero: a viewport smaller than the panel would
 * otherwise produce a negative offset, which puts the text off the top or left
 * of the screen where there is no way to scroll to it. Degrading to the margin
 * shows a clipped panel, which is recoverable; the negative is not. */
function clamp(value: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(value, Math.max(min, max))));
}

export function placeHelpTip({
  trigger,
  panel,
  viewport,
  prefer,
}: {
  trigger: HelpTipRect;
  panel: HelpTipSize;
  viewport: HelpTipViewport;
  /** 'right' for a nav row (the side menu's shape), 'bottom' for a form field
   * label. Either may end up somewhere else if there is no room. */
  prefer: 'right' | 'bottom';
}): PlacedHelpTip {
  const maxLeft = viewport.width - panel.width - HELP_TIP_VIEWPORT_MARGIN;
  const maxTop = viewport.height - panel.height - HELP_TIP_VIEWPORT_MARGIN;

  if (prefer === 'right') {
    const rightEdge = trigger.left + trigger.width + HELP_TIP_GAP + panel.width;
    const leftFlipped = trigger.left - HELP_TIP_GAP - panel.width;
    // Centred on the trigger rather than aligned to its top: a nav row is 36px
    // tall and a two-line panel is 72px, so top-aligning reads as attached to
    // the row above.
    const centred = trigger.top + trigger.height / 2 - panel.height / 2;

    if (rightEdge <= viewport.width - HELP_TIP_VIEWPORT_MARGIN) {
      return {
        placement: 'right',
        left: Math.round(trigger.left + trigger.width + HELP_TIP_GAP),
        top: clamp(centred, HELP_TIP_VIEWPORT_MARGIN, maxTop),
      };
    }
    if (leftFlipped >= HELP_TIP_VIEWPORT_MARGIN) {
      return {
        placement: 'left',
        left: Math.round(leftFlipped),
        top: clamp(centred, HELP_TIP_VIEWPORT_MARGIN, maxTop),
      };
    }
    // Neither side fits. Every phone lands here — a 260px panel cannot sit
    // beside anything on a 375px screen — which is what makes this responsive
    // without a media query or a viewport read in the component.
  }

  const below = trigger.top + trigger.height + HELP_TIP_GAP;
  const fitsBelow = below + panel.height <= viewport.height - HELP_TIP_VIEWPORT_MARGIN;
  const above = trigger.top - HELP_TIP_GAP - panel.height;

  return {
    placement: fitsBelow ? 'bottom' : 'top',
    left: clamp(trigger.left, HELP_TIP_VIEWPORT_MARGIN, maxLeft),
    top: fitsBelow ? Math.round(below) : clamp(above, HELP_TIP_VIEWPORT_MARGIN, maxTop),
  };
}
