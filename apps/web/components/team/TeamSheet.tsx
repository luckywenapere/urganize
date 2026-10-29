'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@/components/icons';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { lockBodyScroll } from '@/lib/body-scroll-lock';

/**
 * The Team tab's overlay (issue #853). `side`: slides in from the right on a
 * computer (a person's tasks, over the grid) and fills the screen from the
 * bottom on a phone. `center`: a dialog on a computer, a bottom sheet on a
 * phone (invite, change access). Mounted only while open; the house
 * DialogPanel gives it the dialog role, the focus trap and Escape.
 */
export function TeamSheet({
  title,
  onClose,
  variant = 'side',
  hideTitle = false,
  children,
}: {
  title: string;
  onClose: () => void;
  variant?: 'side' | 'center';
  /** The panel draws its own heading (a person's face and name). */
  hideTitle?: boolean;
  children: ReactNode;
}) {
  useEffect(() => lockBodyScroll(), []);
  if (typeof document === 'undefined') return null;

  const panel =
    variant === 'side'
      ? 'absolute inset-x-0 bottom-0 top-[max(env(safe-area-inset-top,0px),1.5rem)] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-stroke-default bg-bg-surface px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 md:inset-y-0 md:left-auto md:right-0 md:top-0 md:w-[400px] md:rounded-none md:border-l md:border-t-0 md:pt-5'
      : 'absolute inset-x-0 bottom-0 max-h-[calc(100dvh-env(safe-area-inset-top,0px)-1rem)] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-stroke-default bg-bg-surface px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:border md:pb-6 md:pt-5';

  return createPortal(
    <div className="fixed inset-0 z-[170]">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <DialogPanel label={title} onClose={onClose} className={panel}>
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-stroke-strong md:hidden" aria-hidden="true" />
        <div className={hideTitle ? 'absolute right-4 top-4 md:right-4 md:top-4' : 'flex items-center justify-between gap-3 pb-4'}>
          {hideTitle ? null : <h2 className="truncate font-display text-2xl text-content-primary">{title}</h2>}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="motion-focus grid h-9 w-9 shrink-0 place-items-center rounded-full border border-stroke-default text-content-secondary hover:text-content-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </DialogPanel>
    </div>,
    document.body
  );
}
