// The Tab-wrap decision for a modal dialog, kept pure so it can be tested.
//
// `aria-modal` tells assistive tech the page behind is inert, but it does not
// make it so: without a trap, Tab walks out of the dialog into the page under
// the scrim. The interface review found about 25 overlays doing exactly that.
// The hook in lib/use-dialog-focus.ts owns the DOM side; this owns the rule.

// Tabbable controls only: anything with tabindex="-1" is deliberately out of
// the Tab order (a backdrop that closes the dialog on click is a <button
// tabindex="-1"> so that Tab never lands on it), so it must not count as the
// first or last stop either.
export const DIALOG_FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
]
  .map((selector) => `${selector}:not([tabindex="-1"])`)
  .concat('[tabindex]:not([tabindex="-1"])')
  .join(', ');

/**
 * Where Tab should go next, or null to let the browser do what it would do.
 *
 * `focusables` is the dialog's tabbable elements in order, `active` is the
 * element that has focus now, and `contains` says whether an element is inside
 * the dialog. Focus that has ended up OUTSIDE the dialog is pulled back in.
 */
export function nextTabTarget<T>(
  focusables: readonly T[],
  active: T | null,
  shift: boolean,
  contains: (element: T | null) => boolean
): T | null {
  if (focusables.length === 0) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const inside = contains(active);
  if (shift && (active === first || !inside)) return last;
  if (!shift && (active === last || !inside)) return first;
  return null;
}
