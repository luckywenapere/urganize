import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab inside a dialog. A modal that lets focus wander behind it is a
 * modal a keyboard or screen-reader user can get lost in, which is the one
 * thing a sheet that covers the page must never allow.
 */
export function trapTabKey(event: ReactKeyboardEvent, container: HTMLElement | null): void {
  if (event.key !== 'Tab' || !container) return;
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
