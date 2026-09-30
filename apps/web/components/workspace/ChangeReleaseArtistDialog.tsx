'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { AlertCircle, Loader2 } from '@/components/icons';
import { Button } from '@urganize/ui';
import { supabase } from '@/lib/supabase/client';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import type { Release } from '@/types/releases';

type ChangeReleaseArtistDialogProps = {
  open: boolean;
  release: Pick<Release, 'id' | 'title' | 'artistId' | 'artistName'> | null;
  onClose: () => void;
  /** Called after the server confirms. The parent re-syncs the catalog. */
  onChanged: (releaseId: string, artistName: string) => void;
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

/**
 * Move a release to a different artist.
 *
 * Modelled on ArchiveReleaseDialog, portal included — that is MANDATORY rather
 * than stylistic: AppShell's `lazy-fade` wrapper carries a transform that breaks
 * `position: fixed` for every descendant.
 *
 * IT SAYS THE VISIBILITY PART OUT LOUD, and that line is the reason this is a
 * dialog rather than an inline dropdown. An artist-scoped teammate sees exactly
 * the releases whose artist matches their scope, so moving one hands it to one
 * person and takes it from another. That is an access change wearing the
 * clothes of an edit, and the manager should read it before confirming.
 *
 * Not styled destructive: nothing is lost and the same control moves it back.
 */
export function ChangeReleaseArtistDialog({
  open,
  release,
  onClose,
  onChanged,
}: ChangeReleaseArtistDialogProps) {
  const artists = useArtistRosterStore((state) => state.artists);
  const loadRoster = useArtistRosterStore((state) => state.load);
  const [selectedId, setSelectedId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Render-time reset with a prev guard rather than an effect, so no
  // set-state-in-effect warning (the DeleteReleaseDialog pattern).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setError('');
      setSelectedId(release?.artistId ?? '');
    }
  }

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Refresh on open so an artist added in Settings moments ago is selectable.
  // The store's recency guard makes a reopen free.
  useEffect(() => {
    if (!open) return;
    void loadRoster();
  }, [open, loadRoster]);

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

  const target = artists.find((artist) => artist.id === selectedId) ?? null;
  const unchanged = !selectedId || selectedId === release.artistId;

  const handleConfirm = async () => {
    if (unchanged || !target) return;
    setIsSaving(true);
    setError('');
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(`/api/releases/${release.id}/artist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ artistId: selectedId }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Could not move this rollout.');
      }

      onChanged(release.id, target.name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not move this rollout.');
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
        aria-label="Close change artist dialog"
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
        aria-labelledby="change-release-artist-title"
        className="relative w-full max-w-md urg-cartouche rounded-2xl border border-stroke-default bg-bg-surface p-6 shadow-2xl"
      >
        <h2
          id="change-release-artist-title"
          className="font-display text-lg font-semibold text-content-primary"
        >
          Move this rollout
        </h2>
        <p className="mt-2 text-sm leading-6 text-content-secondary">
          &ldquo;{release.title}&rdquo; is filed under{' '}
          <span className="text-content-primary">{release.artistName || 'no artist'}</span>. Pick who
          it belongs to.
        </p>

        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-medium text-content-primary">Artist</span>
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            disabled={isSaving}
            className="w-full rounded-lg border border-stroke-default bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
          >
            {artists.length === 0 ? (
              <option value="">Loading your artists…</option>
            ) : null}
            {artists.map((artist) => (
              <option key={artist.id} value={artist.id}>
                {artist.name}
              </option>
            ))}
          </select>
        </label>

        {/* The access consequence, said before the button rather than after.
            Rendered only when a move is actually selected, so it reads as a
            consequence of this choice and not as boilerplate. */}
        {!unchanged ? (
          <p className="mt-3 text-xs leading-5 text-content-tertiary">
            Anyone who only sees {release.artistName || 'this artist'} will lose this rollout, and
            anyone who only sees {target?.name} will gain it.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-status-error">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={isSaving || unchanged}>
            {isSaving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Moving…
              </span>
            ) : (
              'Move rollout'
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
