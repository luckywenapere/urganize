'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle } from '@/components/icons';
import { Button } from '@urganize/ui';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useDialogFocus } from '@/lib/use-dialog-focus';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  /** 'danger' paints the confirm button red: deletes and anything that cuts
   *  someone off. */
  tone?: 'danger' | 'default';
  onClose: () => void;
  /** Resolves when the action is done. A thrown Error's message is shown in the
   *  dialog, so the person keeps their context instead of losing it to a toast
   *  they may not see. */
  onConfirm: () => Promise<void>;
};

/**
 * The one confirmation the Shows screens use: delete a show or a festival,
 * delete a set or a song, turn off someone's link.
 *
 * Follows NoteDeleteDialog's contract (portal to body, because AppShell's
 * transform breaks `position: fixed` for descendants; the shared scroll lock;
 * Escape closes), with one Apple-style addition: focus starts on Cancel. For
 * an action that cannot be undone, the key a person presses without looking
 * should be the safe one.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = 'danger',
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setError('');
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isWorking) {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isWorking, onClose, open]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  // Focus starts on the first control, which is Cancel (it comes first in the
  // DOM even though the row is reversed on phones), and Tab stays in the
  // dialog. Focus returns to the button that opened it. See lib/use-dialog-focus.
  useDialogFocus(open, panelRef);

  // Only ever opened by a tap, so it never renders on the server; the guard is
  // for safety, not for hydration.
  if (!open || typeof document === 'undefined') return null;

  const handleConfirm = async () => {
    setIsWorking(true);
    setError('');
    try {
      await onConfirm();
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : 'That didn’t work. Try again.');
    } finally {
      setIsWorking(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-x-0 top-0 z-[220] flex h-[100dvh] items-center justify-center bg-black/60 px-4 py-4 backdrop-blur-sm"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0"
        onClick={() => {
          if (!isWorking) onClose();
        }}
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="shows-confirm-title"
        aria-describedby={body ? 'shows-confirm-body' : undefined}
        className="relative w-full max-w-sm rounded-2xl border border-stroke-default bg-bg-surface p-5 shadow-xl"
      >
        <h2 id="shows-confirm-title" className="font-display text-lg font-semibold text-content-primary">
          {title}
        </h2>
        {body ? (
          <div id="shows-confirm-body" className="mt-2 text-sm leading-6 text-content-secondary">
            {body}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isWorking}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={() => void handleConfirm()}
            isLoading={isWorking}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
