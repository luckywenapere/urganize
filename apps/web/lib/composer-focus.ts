/**
 * Putting the cursor in the UrgAns box without stealing it from anything else
 * (2026-10-07). The conversation focuses its box on arrival, and since Home on a
 * desktop now carries the conversation too, that must never pull focus away from
 * the tour, the create-rollout modal, or a control the person is using in the
 * Home column beside it.
 */

/** Marks the throwaway field lib/keyboard-handoff.ts focuses inside a tap. */
export const KEYBOARD_PROXY_ATTRIBUTE = 'data-keyboard-proxy';

export type AutoFocusContext = {
  /** Nothing has focus. */
  activeIsBody: boolean;
  /** The keyboard proxy has focus: it exists only so the box can take over. */
  activeIsKeyboardProxy: boolean;
  /** Something on the page itself (not the top bar) has focus. */
  activeInMain: boolean;
  /** A modal dialog is open. */
  dialogOpen: boolean;
};

/** Pure: may the box take focus right now? */
export function mayAutoFocusComposer(context: AutoFocusContext): boolean {
  if (context.dialogOpen) return false;
  if (context.activeIsBody || context.activeIsKeyboardProxy) return true;
  return !context.activeInMain;
}

/** Reads the context from the page. `composer` itself never counts as "in use". */
export function readAutoFocusContext(composer: HTMLElement | null): AutoFocusContext {
  const active = document.activeElement;
  const main = document.getElementById('main-content');
  return {
    activeIsBody: !active || active === document.body || active === main,
    activeIsKeyboardProxy: active instanceof HTMLElement && active.hasAttribute(KEYBOARD_PROXY_ATTRIBUTE),
    activeInMain: Boolean(main && active && active !== composer && main.contains(active)),
    dialogOpen: document.querySelector('[aria-modal="true"]') !== null,
  };
}

/** Asks whichever UrgAns box is on screen to take focus. */
export const COMPOSER_FOCUS_EVENT = 'urganize:composer-focus';

export function requestComposerFocus(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(COMPOSER_FOCUS_EVENT));
}
