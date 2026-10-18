'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@/components/icons';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { cn } from '@/components/admin/ui';

// The admin hub's Sheet (2026-10-18, runway form). Follows shadcn's Sheet
// side="bottom" / Drawer: a panel that rises from the bottom on phone, with a
// grab handle, a title (and an optional info icon), and a round Close. On lg+
// it sits in the middle of the screen as a dialog, since a bottom sheet on a
// wide screen reads as a stray footer. No new dependency: the house
// DialogPanel gives it the dialog role, focus trap and Escape, and the shared
// body scroll lock keeps the page still underneath. Mounted only while open.
//
// Portalled to document.body like the app's other sheets, at z-[170], so the
// admin bottom bar (z-40) sits under it.

export function Sheet({
  title,
  info,
  onClose,
  children,
  className,
}: {
  title: string;
  info?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => lockBodyScroll(), []);
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[170]">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <DialogPanel
        label={title}
        onClose={onClose}
        className={cn(
          'absolute inset-x-0 bottom-0 max-h-[calc(100dvh-env(safe-area-inset-top,0px)-1rem)] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-stroke-default bg-bg-surface px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3',
          'lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:w-full lg:max-w-lg lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl lg:border lg:pb-6 lg:pt-5',
          className
        )}
      >
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-stroke-strong lg:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3 pb-4">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="truncate font-display text-2xl font-semibold text-content-primary">{title}</h2>
            {info}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="motion-focus grid h-10 w-10 shrink-0 place-items-center rounded-full bg-bg-hover text-content-secondary hover:text-content-primary"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </DialogPanel>
    </div>,
    document.body
  );
}
