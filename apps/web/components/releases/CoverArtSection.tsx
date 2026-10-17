/* eslint-disable @next/next/no-img-element */
'use client';

import { useCallback, useState } from 'react';
import { Loader2, Plus } from '@/components/icons';
import { formatFileSize } from '@/lib/asset-constants';
import { COVER_ART_FILE_ACCEPT } from '@/lib/cover-art-upload';
import { DSP_REQUIREMENT_LABEL, formatDimensions, gradeCoverArt } from '@/lib/cover-art-dsp';
import { supabase } from '@/lib/supabase/client';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useSceneDataStore } from '@/stores/useSceneDataStore';
import type { ReleaseCoverArt } from '@/types/cover-art';
import { useSceneData } from './useSceneData';
import { useCoverArtUpload } from './useCoverArtUpload';

const PRIMARY_BUTTON =
  'motion-focus motion-press inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60';
const QUIET_BUTTON =
  'motion-focus motion-press inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-stroke-default bg-transparent px-3.5 text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-60';

type CoverArtSectionProps = {
  releaseId: string;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

/**
 * The release's cover art — upload it, replace it, remove it.
 *
 * A release has AT MOST ONE current cover art, unlike the Song scene's
 * newest-first list: uploading a new image here always REPLACES whatever
 * was there (the record route deletes the previous asset), so this renders
 * a single preview with Replace/Remove controls rather than a list.
 *
 * Cache-first but MEMORY-ONLY (see lib/scene-cache.ts): the payload carries
 * a 1h signed Storage URL, so re-opening within a session is instant and a
 * new session always re-signs rather than painting a stale image.
 *
 * On a successful upload or removal this ALSO force-refreshes the workspace
 * command center, so the release's card in the catalog grid (and anywhere
 * else `coverArtUrl` is read from `useReleaseStore`) reflects the change the
 * moment the user leaves this scene — without that, the catalog would still
 * show the old artwork (or the workspace-logo fallback) until a full reload.
 */
export function CoverArtSection({ releaseId, onToast }: CoverArtSectionProps) {
  const { data, isLoading, error: loadError, reload } = useSceneData(releaseId, 'coverart');
  const setScene = useSceneDataStore((state) => state.setScene);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const coverArt = data?.coverArt ?? null;
  const [isRemoving, setIsRemoving] = useState(false);

  const handleUploaded = useCallback(
    (uploaded: ReleaseCoverArt) => {
      setScene(releaseId, 'coverart', { coverArt: uploaded });
      onToast('Cover art updated.', 'success');
      void loadCommandCenter({ force: true });
    },
    [loadCommandCenter, onToast, releaseId, setScene]
  );

  const upload = useCoverArtUpload({
    releaseId,
    accept: COVER_ART_FILE_ACCEPT,
    onUploaded: handleUploaded,
    onToast,
  });

  /**
   * Which grade to show, if any. Deliberately NOT `upload.grade ?? stored`:
   * the picker's grade outlives the file it described, so after a REMOVE that
   * would keep claiming a verdict for artwork that is no longer there. The
   * uploaded/stored image is the subject; the picked file only speaks for
   * itself while its upload is still in flight.
   */
  const storedGrade =
    coverArt && coverArt.width && coverArt.height
      ? gradeCoverArt({
          width: coverArt.width,
          height: coverArt.height,
          mimeType: coverArt.mimeType,
        })
      : null;
  const displayGrade = upload.isUploading ? upload.grade : storedGrade;

  const handleRemove = async () => {
    if (!coverArt) return;
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
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not remove the cover art.', 'error');
    } finally {
      setIsRemoving(false);
    }
  };

  const [dragging, setDragging] = useState(false);
  const busy = upload.isUploading || isRemoving;
  const meta = coverArt
    ? [
        coverArt.fileName,
        formatFileSize(coverArt.fileSize),
        coverArt.width && coverArt.height ? formatDimensions(coverArt.width, coverArt.height) : '',
      ].filter(Boolean)
    : [];

  // 2026-10-17 (founder approved mocks "cuts-3"): Files is cover art only, so
  // this scene is one square, one accent action, then Replace / Remove and a
  // one-line verdict ("Ready for stores").
  return (
    <div className="mt-8">
      <section
        aria-label="Cover art"
        className="rounded-2xl border border-stroke-default bg-bg-surface p-4 sm:p-5"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
          {/* A square preview, same aspect ratio the release cards use. Empty,
              it is also the drop target and opens the picker. */}
          <div
            className={`aspect-square w-full shrink-0 overflow-hidden rounded-xl sm:w-[200px] ${
              coverArt?.downloadUrl ? 'bg-bg-elevated' : ''
            }`}
          >
            {isLoading ? (
              <div className="h-full w-full animate-pulse rounded-xl bg-bg-elevated" />
            ) : coverArt?.downloadUrl ? (
              <img src={coverArt.downloadUrl} alt="Cover art" className="h-full w-full object-cover" />
            ) : (
              <button
                type="button"
                onClick={upload.openPicker}
                disabled={busy}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const file = event.dataTransfer.files?.[0];
                  if (file) upload.uploadFile(file);
                }}
                className={`motion-focus flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-bg-base text-content-primary/55 transition-colors hover:border-content-secondary hover:text-content-primary ${
                  dragging ? 'border-brand text-content-primary' : 'border-stroke-default'
                }`}
              >
                {upload.isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <Plus className="h-5 w-5" aria-hidden="true" />
                )}
                <span className="text-[13px]">{upload.isUploading ? 'Uploading…' : 'Drop or choose'}</span>
              </button>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-display text-[22px] leading-tight text-content-primary">Cover art</h3>
            <p className="mt-1.5 text-sm text-content-primary/55">{DSP_REQUIREMENT_LABEL}.</p>
            {meta.length > 0 ? (
              <p className="mt-2 truncate font-mono text-[11px] text-content-tertiary" title={coverArt?.fileName}>
                {meta.join(' · ')}
              </p>
            ) : null}

            {/* The verdict on what is CURRENTLY on the release, so a
                below-spec image stays visibly below spec. Nothing for an image
                whose dimensions were never recorded. */}
            {displayGrade && displayGrade.verdict !== 'blocked' ? (
              <p className="mt-2.5 flex items-start gap-2 text-sm text-content-primary">
                <span
                  className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${
                    displayGrade.verdict === 'ready' ? 'bg-brand' : 'bg-status-warning'
                  }`}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  {displayGrade.verdict === 'ready' ? 'Ready for stores' : displayGrade.headline}
                  {displayGrade.verdict !== 'ready' && displayGrade.detail ? (
                    <span className="block text-[13px] text-content-primary/55">{displayGrade.detail}</span>
                  ) : null}
                </span>
              </p>
            ) : null}

            <input className="sr-only" {...upload.inputProps} />
            <div className="mt-4 flex flex-wrap gap-2">
              {coverArt ? (
                <>
                  <button type="button" onClick={upload.openPicker} disabled={busy} className={QUIET_BUTTON}>
                    {upload.isUploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    {upload.isUploading ? 'Uploading…' : 'Replace'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRemove()}
                    disabled={busy}
                    className={`${QUIET_BUTTON} text-content-primary/55 hover:text-content-primary`}
                  >
                    {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    Remove
                  </button>
                </>
              ) : (
                <button type="button" onClick={upload.openPicker} disabled={busy} className={PRIMARY_BUTTON}>
                  {upload.isUploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  {upload.isUploading ? 'Uploading…' : 'Choose cover art'}
                </button>
              )}
              {upload.retryFile ? (
                <button type="button" onClick={upload.retry} disabled={busy} className={QUIET_BUTTON}>
                  Retry
                </button>
              ) : null}
            </div>

            {upload.error ? (
              <p className="mt-3 text-[13px] text-status-error" role="alert">
                {upload.error}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {loadError ? (
        <div className="mt-4 rounded-2xl border border-status-error/30 bg-status-error/5 p-4">
          <p className="text-sm text-content-primary">We could not load this rollout&apos;s cover art.</p>
          <p className="mt-1 text-[13px] text-content-primary/55">{loadError}</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="motion-focus mt-3 text-sm font-semibold text-brand hover:underline"
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
