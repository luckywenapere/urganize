/**
 * Keeping a menu on the screen (menu audit, 2026-10-14).
 *
 * Most menus in the app are a panel drawn `absolute` beside their button,
 * aligned to its left or right edge. That is right on a computer and wrong on
 * a phone whenever the button is not where the author pictured it: the rollout
 * plan's Filters button sits near the right of a 390px screen, its panel was
 * aligned to the button's LEFT edge, and "Any status" ran off the side. The
 * show page's status menu has the mirror problem when its buttons wrap to the
 * left of a phone screen.
 *
 * Rather than patch each menu's alignment for each width, every menu keeps its
 * own CSS placement and then gets nudged back on screen once it is drawn: these
 * functions decide the nudge, and `useKeepInViewport` applies it. Pure, and
 * here in lib/, because vitest runs node-only in this repo with no DOM.
 *
 * Layering, for whoever adds the next menu: an open menu in the page uses
 * z-50. That clears the sticky top bar (z-30), the phone's bottom bar (z-40)
 * and the rollout menu pill's dock (z-20), and stays under the sheets and
 * dialogs (z-[160] and up), which own Escape and the scroll lock.
 */

/** How close a menu may come to the edge of the screen. */
export const MENU_VIEWPORT_MARGIN = 8;

/** The smallest height worth capping a menu to. Below this a scrolling menu is
 *  harder to use than one that runs past the edge, so it is left alone. */
export const MENU_MIN_HEIGHT = 120;

export type MenuRect = { left: number; top: number; width: number; height: number };

/**
 * How far to move a menu sideways so it sits inside the screen, and the width
 * to cap it at when it is wider than the screen itself.
 *
 * A menu wider than the room between the margins is capped to that room and
 * pinned to the left margin, so its text is never off the left edge where
 * nothing can scroll to it.
 */
export function menuShift(
  rect: Pick<MenuRect, 'left' | 'width'>,
  viewportWidth: number,
  margin: number = MENU_VIEWPORT_MARGIN
): { shift: number; maxWidth: number | null } {
  const room = Math.max(0, viewportWidth - margin * 2);
  if (rect.width > room) {
    return { shift: Math.round(margin - rect.left), maxWidth: Math.floor(room) };
  }
  const right = rect.left + rect.width;
  if (rect.left < margin) return { shift: Math.round(margin - rect.left), maxWidth: null };
  if (right > viewportWidth - margin) {
    return { shift: Math.round(viewportWidth - margin - right), maxWidth: null };
  }
  return { shift: 0, maxWidth: null };
}

/**
 * The height to cap a menu at so its bottom stays on screen, or null when it
 * already fits. A menu that opens upward (its top above the screen) is left to
 * its own placement: it is anchored at its bottom, so capping the height would
 * not bring its top back.
 */
export function menuMaxHeight(
  rect: Pick<MenuRect, 'top' | 'height'>,
  viewportHeight: number,
  margin: number = MENU_VIEWPORT_MARGIN
): number | null {
  if (rect.top < 0) return null;
  const bottom = rect.top + rect.height;
  if (bottom <= viewportHeight - margin) return null;
  const room = Math.floor(viewportHeight - margin - rect.top);
  return room >= MENU_MIN_HEIGHT ? room : null;
}

/**
 * Where a panel portalled to the body goes under its button (the Filters
 * popovers): below it, aligned to the button's start or end edge, then held
 * inside the screen. Flips above the button when there is no room below and
 * more room above.
 */
export function placeUnderAnchor({
  anchor,
  panel,
  viewport,
  align,
  gap = 8,
  margin = MENU_VIEWPORT_MARGIN,
}: {
  anchor: MenuRect;
  panel: { width: number; height: number };
  viewport: { width: number; height: number };
  align: 'start' | 'end';
  gap?: number;
  margin?: number;
}): { top: number; left: number; placement: 'bottom' | 'top' } {
  const wanted = align === 'start' ? anchor.left : anchor.left + anchor.width - panel.width;
  const maxLeft = viewport.width - margin - panel.width;
  const left = Math.round(Math.max(margin, Math.min(wanted, maxLeft)));

  const below = anchor.top + anchor.height + gap;
  const roomBelow = viewport.height - margin - below;
  const roomAbove = anchor.top - gap - margin;
  if (panel.height > roomBelow && roomAbove > roomBelow) {
    return { left, top: Math.round(Math.max(margin, anchor.top - gap - panel.height)), placement: 'top' };
  }
  return { left, top: Math.round(below), placement: 'bottom' };
}
