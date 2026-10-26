/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { ImageIcon, Loader2, Plus, Trash2, X } from '@/components/icons';
import { COVER_ART_FILE_ACCEPT } from '@/lib/cover-art-upload';
import { supabase } from '@/lib/supabase/client';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useSceneDataStore } from '@/stores/useSceneDataStore';
import type { ReleaseCoverArt } from '@/types/cover-art';
import { useCoverArtUpload } from '@/components/releases/useCoverArtUpload';

type Tone = 'success' | 'error' | 'warning';

/**
 * The cover tile beside the phone rollout title (founder approved mock, Oct 24,
 * 2026: "this menu is too crowded", cover art goes on the image slot).
 *
 * Empty: a dashed square with a plus. Tapping it opens the file picker straight
 * away, so adding a cover is one tap. Filled: the cover itself. Tapping it opens
 * a small sheet with Change cover and Remove cover. Same upload and remove path
 * as the Cover art scene (useCoverArtUpload, DELETE /cover-art), and the same
 * force-refresh after, so every card showing the cover updates.
 */
export function RolloutCoverTile({
  releaseId,
  title,
  coverUrl,
  onToast,
}: {
  releaseId: string;
  title: string;
  coverUrl: string | null | undefined;
  onToast: (message: string, tone: Tone) => void;
}) {
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const setScene = useSceneDataStore((state) => state.setScene);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const upload = useCoverArtUpload({
    releaseId,
    accept: COVER_ART_FILE_ACCEPT,
    onUploaded: (uploaded: ReleaseCoverArt) => {
      setScene(releaseId, 'coverart', { coverArt: uploaded });
      onToast('Cover art updated.', 'success');
      void loadCommandCenter({ force: true });
    },
    onToast: (message, tone) => onToast(message, tone),
  });

  // A blocked file (wrong size or type) never uploads; say why.
  const shownError = upload.error;
  const busy = upload.isUploading || isRemoving;

  const remove = async () => {
    if (!window.confirm('Remove the cover art? This cannot be undone.')) return;
    setIsRemoving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      if (!token) {
        onToast('Your session expired. Sign in again and retry.', 'error');
        return;
      }
      const response = await fetch(`/api/releases/${releaseId}/cover-art`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        onToast(body.error || 'Could not remove the cover art.', 'error');
        return;
      }
      setScene(releaseId, 'coverart', { coverArt: null });
      onToast('Cover art removed.', 'success');
      void loadCommandCenter({ force: true });
      setSheetOpen(false);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not remove the cover art.', 'error');
    } finally {
      setIsRemoving(false);
    }
  };

  const onTileClick = () => {
    if (busy) return;
    upload.clearError();
    if (coverUrl) setSheetOpen(true);
    else upload.openPicker();
  };

  // A blocked file (wrong size or type) never uploads: say why once, as a
  // toast, then clear it so the tile stays quiet.
  const { clearError } = upload;
  useEffect(() => {
    if (!shownError || upload.isUploading) return;
    onToast(shownError, 'error');
    clearError();
  }, [shownError, upload.isUploading, onToast, clearError]);

  return (
    <>
      <input {...upload.inputProps} className="sr-only" tabIndex={-1} aria-hidden="true" />
      <button
        type="button"
        onClick={onTileClick}
        aria-label={coverUrl ? `Cover art for ${title}. Change or remove` : `Add cover art for ${title}`}
        className={`motion-focus motion-press relative grid h-14 w-14 shrink-0 touch-manipulation place-items-center overflow-hidden rounded-[10px] ${
          coverUrl ? 'bg-bg-surface' : 'border border-dashed border-stroke-strong bg-bg-surface hover:bg-bg-hover'
        }`}
      >
        {coverUrl ? (
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Plus className="h-5 w-5 text-brand" aria-hidden="true" />
        )}
        {busy ? (
          <span className="absolute inset-0 grid place-items-center bg-black/50">
            <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden="true" />
          </span>
        ) : null}
      </button>

      {sheetOpen && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[170] lg:hidden">
              <button
                type="button"
                aria-label="Close cover art"
                tabIndex={-1}
                onClick={() => setSheetOpen(false)}
                className="absolute inset-0 bg-black/50"
              />
              <DialogPanel
                label="Cover art"
                onClose={() => setSheetOpen(false)}
                className="absolute inset-x-0 bottom-0 flex flex-col rounded-t-3xl border-t border-stroke-default bg-bg-surface pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3"
              >
                <div className="mx-auto mb-1 h-1 w-10 shrink-0 rounded-full bg-stroke-strong" aria-hidden="true" />
                <div className="flex items-center justify-between px-4 pb-1">
                  <h2 className="font-display text-xl font-semibold text-content-primary">Cover art</h2>
                  <button
                    type="button"
                    onClick={() => setSheetOpen(false)}
                    aria-label="Close"
                    className="motion-focus grid h-11 w-11 place-items-center rounded-full text-content-tertiary hover:bg-bg-hover"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                <ul className="px-2">
                  <li>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setSheetOpen(false);
                        upload.openPicker();
                      }}
                      className="motion-focus flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] text-content-primary hover:bg-bg-hover disabled:opacity-60"
                    >
                      <ImageIcon className="h-5 w-5 text-content-secondary" aria-hidden="true" />
                      Change cover
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove()}
                      className="motion-focus flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] text-status-error hover:bg-bg-hover disabled:opacity-60"
                    >
                      <Trash2 className="h-5 w-5" aria-hidden="true" />
                      Remove cover
                    </button>
                  </li>
                </ul>
              </DialogPanel>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
