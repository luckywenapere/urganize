'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Minimize2 } from '@/components/icons';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useDialogFocus } from '@/lib/use-dialog-focus';

type TimelineFullScreenProps = {
  /** Names the dialog for a screen reader and heads the bar. */
  title: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * The timeline, filling the app window (founder, 2026-10-07: "a way to make the
 * timeline view full screen"). It covers the top bar, the tabs and the floating
 * UrgAns button; it is NOT the browser's own full screen, which iPhone Safari
 * does not offer and which would hide the address bar too.
 *
 * Portalled to `document.body` and fixed to the viewport: AppShell's `lazy-fade`
 * transform makes a `fixed` descendant measure against its own box, the trap
 * `DeleteReleaseDialog` already portals around.
 *
 * Z-tier 160, below the activity pop-up and the sheets (170 and up), so tapping
 * an activity inside it opens the pop-up ON TOP rather than behind it.
 *
 * ESCAPE yields to any other open dialog. The activity pop-up owns Escape (see
 * TaskOutcomeSheet's note), and two window listeners on one keypress would close
 * both and drop the person out of the thing they were editing. So this only
 * closes when no OTHER `aria-modal` dialog is on the page.
 */
export function TimelineFullScreen({ title, onClose, children }: TimelineFullScreenProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, panelRef, { initialFocus: 'panel' });

  useEffect(() => lockBodyScroll(), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const others = Array.from(document.querySelectorAll('[aria-modal="true"]')).filter(
        (node) => node !== panelRef.current
      );
      if (others.length > 0) return;
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      className="fixed inset-0 z-[160] flex flex-col bg-bg-base focus:outline-none"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-stroke-default px-4 py-3 sm:px-6">
        <h2 className="min-w-0 truncate font-display text-lg text-content-primary">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          data-autofocus
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-stroke-control px-3 text-sm font-medium text-content-secondary transition-colors hover:border-content-secondary hover:text-content-primary"
        >
          <Minimize2 className="h-4 w-4" aria-hidden="true" />
          Exit full screen
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 sm:px-6">{children}</div>
    </div>,
    document.body
  );
}
