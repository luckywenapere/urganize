'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { AlertCircle, Loader2 } from '@/components/icons';
import { Button } from '@urganize/ui';
import { supabase } from '@/lib/supabase/client';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import type { Release } from '@/types/releases';

type ArchiveReleaseDialogProps = {
  open: boolean;
  release: Pick<Release, 'id' | 'title'> | null;
  /** True when the release is already archived, which turns this into a
   *  restore. One dialog for both directions: they are the same decision. */
  archived: boolean;
  onClose: () => void;
  /** Called after the server confirms. The parent re-syncs the catalog. */
  onArchived: (releaseId: string, archived: boolean) => void;
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

/**
 * Confirmation for shelving a finished release, or bringing one back.
 *
 * Modelled on DeleteReleaseDialog, including the portal, which is MANDATORY
 * rather than stylistic: AppShell's `lazy-fade` wrapper carries a transform that
 * breaks `position: fixed` for every descendant.
 *
 * Deliberately NOT styled as destructive. Archiving loses nothing — the release,
 * its activities and its files all stay exactly where they are, and the same
 * button brings it back. Borrowing the delete dialog's red would teach people to
 * fear an action whose whole purpose is to be safe to take, and a manager who is
 * afraid to archive keeps finished releases on the board forever.
 */
export function ArchiveReleaseDialog({
  open,
  release,
  archived,
  onClose,
  onArchived,
}: ArchiveReleaseDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Render-time reset with a prev guard rather than an effect, so no
  // set-state-in-effect warning (the DeleteReleaseDialog pattern).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setError('');
  }

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSaving, onClose, open]);

  // Shared ref-counted lock, not a hand-rolled save/restore: a private one
  // captures another open modal's 'hidden' as its "original" and writes it back
  // on close, leaving the page unscrollable. See lib/body-scroll-lock.ts.
  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open && isMounted && Boolean(release), panelRef);

  if (!open || !isMounted || !release) return null;

  const nextArchived = !archived;

  const handleConfirm = async () => {
    setIsSaving(true);
    setError('');
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(`/api/releases/${release.id}/archive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ archived: nextArchived }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          payload.error || (nextArchived ? 'Could not archive rollout.' : 'Could not restore rollout.')
        );
      }

      onArchived(release.id, nextArchived);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : nextArchived
            ? 'Could not archive rollout.'
            : 'Could not restore rollout.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const dialog = (
    <div
      className="fixed inset-x-0 top-0 z-[220] flex h-[100dvh] items-center justify-center bg-black/72 px-4 py-4 backdrop-blur-sm sm:py-8"
      role="presentation"
    >
      <button
        type="button"
        aria-label={nextArchived ? 'Close archive rollout dialog' : 'Close restore rollout dialog'}
        className="absolute inset-0"
        onClick={() => {
          if (!isSaving) onClose();
        }}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-release-title"
        className="relative mx-auto w-full max-w-md border border-stroke-default bg-bg-surface shadow-[0_30px_90px_-46px_rgb(var(--shadow-ink)/calc(0.76*var(--shadow-alpha-scale)))]"
      >
        <div className="p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
            {nextArchived ? 'Archive rollout' : 'Restore rollout'}
          </p>
          <h2
            id="archive-release-title"
            className="mt-2 font-display text-xl font-semibold leading-snug text-content-primary"
          >
            {nextArchived ? 'Archive' : 'Restore'} &ldquo;{release.title}&rdquo;?
          </h2>
          <p className="mt-2 text-sm leading-6 text-content-secondary">
            {nextArchived
              ? 'It moves off your active list. Everything stays: the activities, the files, the notes. You can bring it back whenever you want.'
              : 'It goes back on your active list, exactly as you left it.'}
          </p>
        </div>

        {error ? (
          <div role="alert" className="mx-4 mb-4 flex items-start gap-3 border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error sm:mx-5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 border-t border-stroke-subtle p-4 sm:flex-row sm:justify-end sm:p-5">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isSaving}
            isLoading={isSaving}
            leftIcon={isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          >
            {nextArchived ? 'Archive rollout' : 'Restore rollout'}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
