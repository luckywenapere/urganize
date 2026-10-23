'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@urganize/ui';
import { AlertCircle, Loader2 } from '@/components/icons';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { lockBodyScroll } from '@/lib/body-scroll-lock';

type DeleteForeverDialogProps = {
  open: boolean;
  /** The rollout in Trash this dialog is asking about. */
  item: { id: string; title: string; taskCount: number } | null;
  /** Resolves to an error message, or null when the purge worked. */
  onConfirm: (id: string) => Promise<string | null>;
  onClose: () => void;
};

/**
 * The second, separate confirm for purging a rollout from Trash. No typing:
 * the user already typed to put it in Trash. It says plainly that this cannot
 * be undone, which is what makes it different from the first dialog.
 */
export function DeleteForeverDialog({ open, item, onConfirm, onClose }: DeleteForeverDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setError('');
  }

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose, open]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open && isMounted && Boolean(item), panelRef, {
    onBackClose: () => {
      if (!busy) onClose();
    },
  });

  if (!open || !isMounted || !item) return null;

  const run = async () => {
    setBusy(true);
    setError('');
    const message = await onConfirm(item.id);
    setBusy(false);
    if (message) setError(message);
  };

  const activities = item.taskCount === 1 ? '1 activity' : `${item.taskCount} activities`;

  return createPortal(
    <div
      className="fixed inset-x-0 top-0 z-[220] flex h-[100dvh] items-center justify-center bg-black/72 px-4 py-4 backdrop-blur-sm sm:py-8"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close delete forever dialog"
        className="absolute inset-0"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-forever-title"
        className="relative mx-auto w-full max-w-md border border-stroke-default bg-bg-surface"
      >
        <div className="p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
            Delete forever
          </p>
          <h2
            id="delete-forever-title"
            className="mt-2 font-display text-xl font-semibold leading-snug text-content-primary"
          >
            Delete &ldquo;{item.title}&rdquo; forever?
          </h2>
          <p className="mt-2 text-sm leading-6 text-content-secondary">
            This removes the rollout, its {activities} and its files. It can&rsquo;t be undone.
          </p>
        </div>
        {error ? (
          <div
            role="alert"
            className="mx-4 mb-4 flex items-start gap-3 border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error sm:mx-5"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}
        <div className="flex flex-col-reverse gap-2 border-t border-stroke-subtle p-4 sm:flex-row sm:justify-end sm:p-5">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Keep in Trash
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => void run()}
            disabled={busy}
            isLoading={busy}
            leftIcon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          >
            Delete forever
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
