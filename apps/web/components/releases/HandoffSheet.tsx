'use client';

import { useLayoutEffect, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { DialogPanel } from '@/components/shared/DialogPanel';

const SM_QUERY = '(min-width: 640px)';

/** True from Tailwind's `sm` up: popovers there, bottom sheets below. */
export function useIsSmUp(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(SM_QUERY);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(SM_QUERY).matches,
    () => false
  );
}

const POPOVER_WIDTH = 360;

/**
 * The handoff's two pickers (lead time, owner): a bottom sheet on a phone and a
 * popover under the control that opened it from `sm` up. Mounted only while
 * open. DialogPanel gives it the dialog role, the focus trap and Escape; the
 * scrim (clear on desktop) closes it on an outside tap.
 */
export function HandoffSheet({
  label,
  onClose,
  anchorRef,
  children,
}: {
  label: string;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const smUp = useIsSmUp();
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!smUp) return;
    const place = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const left = Math.max(16, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 16));
      // Below the control when it fits, otherwise above it.
      const roomBelow = window.innerHeight - rect.bottom;
      setPosition(
        roomBelow >= 340 ? { top: rect.bottom + 8, left } : { bottom: window.innerHeight - rect.top + 8, left }
      );
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [smUp, anchorRef]);

  if (typeof document === 'undefined') return null;

  if (smUp) {
    return createPortal(
      <div className="fixed inset-0 z-[170]">
        <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default" />
        <div
          className="absolute"
          style={position ? { ...position, width: POPOVER_WIDTH } : { visibility: 'hidden' }}
        >
          <DialogPanel label={label} onClose={onClose} className="border border-stroke-strong bg-bg-elevated p-4 shadow-2xl">
            {children}
          </DialogPanel>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[170]">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/55" />
      <DialogPanel
        label={label}
        onClose={onClose}
        className="absolute inset-x-0 bottom-0 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain border-t border-stroke-strong bg-bg-elevated px-4 pb-[calc(1.75rem+env(safe-area-inset-bottom))] pt-3"
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-stroke-strong" aria-hidden="true" />
        {children}
      </DialogPanel>
    </div>,
    document.body
  );
}
