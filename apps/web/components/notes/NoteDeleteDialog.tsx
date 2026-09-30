'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { AlertCircle, Loader2 } from '@/components/icons';
import { Button } from '@urganize/ui';
import { lockBodyScroll } from '@/lib/body-scroll-lock';

type NoteDeleteDialogProps = {
  open: boolean;
  /** Derived title of the note in question, already falling back for blanks. */
  noteTitle: string;
  onClose: () => void;
  /** Resolves once the note is gone; the parent owns the follow-up. */
  onConfirm: () => Promise<void>;
};

/**
 * Confirmation for deleting a note. Mirrors DeleteReleaseDialog's portal +
 * backdrop + escape + scroll-lock patterns; the parent performs the delete so
 * the optimistic store update stays in one place.
 */
export function NoteDeleteDialog({ open, noteTitle, onClose, onConfirm }: NoteDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  // Reset a stale error when the dialog reopens — render-time adjust with a
  // prev guard rather than an effect (the DeleteReleaseDialog pattern).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setError('');
    }
  }

  // Portal mount-guard: AppShell's `lazy-fade` wrapper carries a transform
  // that breaks `position: fixed` for any descendant.
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDeleting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDeleting, onClose, open]);

  // Shared ref-counted lock (2026-08-16) — a hand-rolled save/restore here
  // captured another open modal's 'hidden' as its "original" and wrote it
  // back on close, leaving the page unscrollable until a full reload. See
  // lib/body-scroll-lock.ts, which exists for exactly this.
  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open && isMounted, panelRef);

  if (!open || !isMounted) {
    return null;
  }

  const handleDelete = async () => {
    setIsDeleting(true);
    setError('');
    try {
      await onConfirm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete note.');
    } finally {
      setIsDeleting(false);
    }
  };

  const dialog = (
    <div
      className="fixed inset-x-0 top-0 z-[220] flex h-[100dvh] items-center justify-center bg-black/72 px-4 py-4 backdrop-blur-sm sm:py-8"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close delete note dialog"
        className="absolute inset-0"
        onClick={() => {
          if (!isDeleting) {
            onClose();
          }
        }}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-note-title"
        className="relative mx-auto w-full max-w-md border border-stroke-default bg-bg-surface shadow-[0_30px_90px_-46px_rgb(var(--shadow-ink)/calc(0.76*var(--shadow-alpha-scale)))]"
      >
        <div className="p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
            Delete note
          </p>
          <h2
            id="delete-note-title"
            className="mt-2 truncate font-display text-xl font-semibold leading-snug text-content-primary"
          >
            Delete &ldquo;{noteTitle}&rdquo;?
          </h2>
          <p className="mt-2 text-sm leading-6 text-content-secondary">
            This permanently deletes the note. This can&rsquo;t be undone.
          </p>
        </div>

        {error ? (
          <div role="alert" className="mx-4 mb-4 flex items-start gap-3 border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error sm:mx-5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 border-t border-stroke-subtle p-4 sm:flex-row sm:justify-end sm:p-5">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => void handleDelete()}
            disabled={isDeleting}
            isLoading={isDeleting}
            leftIcon={isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          >
            Delete note
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
