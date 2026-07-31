'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@urganize/ui';
import { supabase } from '@/lib/supabase/client';
import type { Release } from '@/types/releases';

type DeleteReleaseDialogProps = {
  open: boolean;
  /** Release the dialog is asking about. Null while closed (or when the
   * scope points at a release that no longer exists). */
  release: Pick<Release, 'id' | 'title'> | null;
  /** Total task count for the release — surfaces the blast radius in the
   * confirmation copy so the user knows exactly what goes with it. */
  tasksTotal: number;
  onClose: () => void;
  /** Called after the server confirms the deletion. The parent owns the
   * follow-up (clear scope, drop local state, re-sync). */
  onDeleted: (releaseId: string) => void;
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || '';
}

/**
 * Compact destructive-action confirmation for deleting a release from the
 * workspace. Mirrors CreateReleaseModal's portal + backdrop + escape + scroll
 * lock patterns; performs its own DELETE fetch (same component-owned fetch
 * convention) and reports the result through onDeleted.
 */
export function DeleteReleaseDialog({
  open,
  release,
  tasksTotal,
  onClose,
  onDeleted,
}: DeleteReleaseDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  // Reset stale error when the dialog (re)opens — render-time adjust with a
  // prev guard (same pattern as TasksPanel's scope-change expansion) instead
  // of an effect, so no set-state-in-effect warning.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setError('');
    }
  }

  // Portal mount-guard — see CreateReleaseModal: AppShell's `lazy-fade`
  // wrapper carries a transform that breaks `position: fixed` for any
  // descendant, so the dialog renders into document.body instead.
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDeleting) {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDeleting, onClose, open]);

  // Lock background scroll while open; restore on close. Same scrollbar-width
  // compensation as CreateReleaseModal so desktop layout doesn't jump.
  useEffect(() => {
    if (!open) {
      return;
    }

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, [open]);

  if (!open || !isMounted || !release) {
    return null;
  }

  const handleDelete = async () => {
    setIsDeleting(true);
    setError('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch(`/api/releases/${release.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Could not delete release.');
      }

      onDeleted(release.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete release.');
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
        aria-label="Close delete release dialog"
        className="absolute inset-0"
        onClick={() => {
          if (!isDeleting) {
            onClose();
          }
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-release-title"
        className="relative mx-auto w-full max-w-md border border-stroke-default bg-bg-surface shadow-[0_30px_90px_-46px_rgb(var(--shadow-ink)/calc(0.76*var(--shadow-alpha-scale)))]"
      >
        <div className="p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
            Delete release
          </p>
          <h2
            id="delete-release-title"
            className="mt-2 font-display text-xl font-semibold leading-snug text-content-primary"
          >
            Delete &ldquo;{release.title}&rdquo;?
          </h2>
          <p className="mt-2 text-sm leading-6 text-content-secondary">
            This permanently deletes the release
            {tasksTotal > 0
              ? `, its ${tasksTotal} ${tasksTotal === 1 ? 'task' : 'tasks'},`
              : ''}{' '}
            and all attached files. This can&rsquo;t be undone.
          </p>
        </div>

        {error ? (
          <div className="mx-4 mb-4 flex items-start gap-3 border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error sm:mx-5">
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
            Delete release
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
