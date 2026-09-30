'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useDialogFocus } from '@/lib/use-dialog-focus';

type DialogPanelProps = {
  /** What a screen reader announces the dialog as. */
  label: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
};

/**
 * The panel of a modal that is mounted only while it is open: gives it the
 * dialog role and a name, moves focus onto it, keeps Tab inside, closes on
 * Escape and hands focus back to whatever opened it.
 *
 * It is the panel only. The caller keeps the backdrop, the portal and the
 * scroll lock, because those differ from one overlay to the next; what every
 * one of them was missing was the part that makes it a dialog. Focus lands on
 * the panel rather than a control, so the label is read first and Tab then
 * enters it.
 */
export function DialogPanel({ label, onClose, className, children }: DialogPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(true, ref, { initialFocus: 'panel' });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      className={`focus:outline-none ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
