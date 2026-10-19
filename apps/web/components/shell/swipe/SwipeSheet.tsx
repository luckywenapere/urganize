'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { usePresence } from '@/components/motion/usePresence';
import { useSwipeNavStore } from '@/stores/useSwipeNavStore';

/**
 * The swipe navigation's bottom sheet (URG-380): the same slide and scrim as
 * the old More sheet (morph-sheet, lib/morph.ts), a grab handle, and while it
 * is open the pager is frozen (no paging behind a sheet). On a desktop the
 * avatar menu is a popover instead (AvatarMenu); the sessions and connections
 * sheets centre as a card from sm up.
 */
export function SwipeSheet({
  open,
  label,
  onClose,
  children,
  desktop = 'card',
}: {
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
  /** 'card': a centred card from sm up. 'phone': phones only (lg:hidden). */
  desktop?: 'card' | 'phone';
}) {
  const presence = usePresence(open);
  const lock = useSwipeNavStore((state) => state.lock);

  useEffect(() => {
    if (!open) return;
    return lock();
  }, [open, lock]);

  if (!presence.mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`morph-presence fixed inset-0 z-[170] ${desktop === 'phone' ? 'lg:hidden' : ''}`}
      data-state={presence.closing ? 'closed' : 'open'}
      data-swipe-sheet
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="morph-sheet-scrim absolute inset-0 bg-black/60"
      />
      <DialogPanel
        label={label}
        onClose={onClose}
        className={`morph-sheet absolute inset-x-0 bottom-0 max-h-[calc(100dvh-env(safe-area-inset-top,0px)-1rem)] overflow-y-auto overscroll-contain rounded-t-[28px] bg-[#18181a] px-5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_40px_rgba(0,0,0,0.4)] ${
          desktop === 'card'
            ? 'sm:bottom-auto sm:top-[12vh] sm:mx-auto sm:w-[26rem] sm:rounded-[24px] sm:border sm:border-stroke-default'
            : ''
        }`}
      >
        <div className="mx-auto mb-3.5 h-[5px] w-10 shrink-0 rounded-full bg-content-primary/20 sm:hidden" aria-hidden="true" />
        {children}
      </DialogPanel>
    </div>,
    document.body
  );
}

/** A row in a swipe sheet: 58px, hairline between rows, 17px label. */
export const SHEET_ROW =
  'motion-focus flex min-h-[58px] w-full items-center gap-4 border-b border-content-primary/[0.07] text-left text-[17px] text-content-primary last:border-b-0';
