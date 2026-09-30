'use client';

import { useEffect, type RefObject } from 'react';
import { DIALOG_FOCUSABLE, nextTabTarget } from '@/lib/dialog-focus';
import { createDialogStack } from '@/lib/dialog-stack';

// One stack for the whole page. Dialogs stack here on purpose (a completion
// sheet over the activity pop-up, a confirmation over a sheet), and only the
// newest may trap Tab: see lib/dialog-stack.ts.
const dialogStack = createDialogStack();

type InitialFocus =
  /** The control marked `data-autofocus` if there is one, else the first
   *  control inside the dialog. The default. (Use the attribute rather than
   *  React's `autoFocus`: that fires during commit, before this hook has
   *  noticed which element opened the dialog, so focus could never go back.) */
  | 'first'
  /** The dialog itself, so a screen reader reads its label first and Tab then
   *  enters the first control. Right for long or content-heavy panels. Needs
   *  `tabIndex={-1}` on the panel. */
  | 'panel'
  /** Leave it alone: the dialog already places focus itself (a field with
   *  `autoFocus`, a heading it focuses per step). */
  | 'none';

/**
 * Focus management for a modal dialog: focus moves in when it opens, Tab stays
 * inside while it is open, and focus goes back to whatever opened it when it
 * closes. Escape is deliberately NOT handled here, because every dialog in
 * this app owns its own dismissal rules (some refuse to close mid-save).
 *
 * Pass the panel element the dialog role sits on. Call it before any early
 * return, and pass `open && isMounted` for a dialog that renders nothing until
 * a mount flag flips, so the effect runs once the panel actually exists.
 */
export function useDialogFocus(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  options: { initialFocus?: InitialFocus } = {}
): void {
  const { initialFocus = 'first' } = options;

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const token = dialogStack.open();

    const tabbables = () =>
      Array.from(panelRef.current?.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE) ?? []).filter(
        // Rendered at all. (offsetParent is null for a fixed-position control
        // that is perfectly visible, so it is the wrong test here.)
        (element) => element.getClientRects().length > 0
      );

    if (panel && initialFocus !== 'none' && !panel.contains(document.activeElement)) {
      const marked = panel.querySelector<HTMLElement>('[data-autofocus]');
      const target =
        initialFocus === 'first' ? (marked ?? tabbables()[0] ?? panel) : panel;
      target.focus({ preventScroll: true });
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const current = panelRef.current;
      if (!current || !dialogStack.isTop(token)) return;

      // Focus already inside a DIFFERENT modal (one that manages itself, and
      // is not a dialog that shares this hook) is that modal's business.
      const active = document.activeElement;
      const foreign = active instanceof Element ? active.closest('[aria-modal="true"]') : null;
      if (foreign && foreign !== current && !current.contains(foreign) && !foreign.contains(current)) return;

      const target = nextTabTarget<Element>(tabbables(), active, event.shiftKey, (element) =>
        Boolean(element && current.contains(element))
      );
      if (target instanceof HTMLElement) {
        event.preventDefault();
        target.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      dialogStack.close(token);
      // Give focus back only if it is still ours to give. When the dialog
      // unmounts the focused control goes with it and focus falls to <body>;
      // when the user has deliberately moved on to something else, leave it.
      const now = document.activeElement;
      const focusIsLost = !now || now === document.body || !now.isConnected || panel?.contains(now);
      if (focusIsLost && opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, panelRef, initialFocus]);
}
