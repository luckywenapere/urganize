/* eslint-disable @next/next/no-img-element */
'use client';

import { useCallback, useState } from 'react';
import { ImageOff, Loader2, Trash2, Upload } from 'lucide-react';
import { formatFileSize } from '@/lib/asset-constants';
import { COVER_ART_FILE_ACCEPT, COVER_ART_MAX_BYTES } from '@/lib/cover-art-upload';
import { DSP_REQUIREMENT_LABEL, formatDimensions, gradeCoverArt } from '@/lib/cover-art-dsp';
import { CoverArtDspNote } from './CoverArtDspNote';
import { supabase } from '@/lib/supabase/client';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useSceneDataStore } from '@/stores/useSceneDataStore';
import type { ReleaseCoverArt } from '@/types/cover-art';
import { useSceneData } from './useSceneData';
import { useCoverArtUpload } from './useCoverArtUpload';

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

  return (
    <div className="mt-8">
      <div className="border border-stroke-default bg-bg-surface p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* A square preview, same aspect ratio the release cards use, so
              what the manager sees here matches what shows up in the
              catalog. */}
          <div className="aspect-square w-full max-w-[160px] shrink-0 overflow-hidden rounded-lg border border-stroke-default bg-bg-elevated">
            {isLoading ? (
              <div className="h-full w-full animate-pulse bg-bg-elevated" />
            ) : coverArt?.downloadUrl ? (
              <img
                src={coverArt.downloadUrl}
                alt="Release cover art"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-content-tertiary">
                <ImageOff className="h-5 w-5" aria-hidden="true" />
                <span className="text-[11px]">No cover art</span>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-content-primary">
              {coverArt ? 'Cover art' : 'Add cover art'}
            </p>
            <p className="mt-1 text-xs text-content-secondary">
              {DSP_REQUIREMENT_LABEL}, up to {formatFileSize(COVER_ART_MAX_BYTES)}. Shows on the
              release card, the press kit and anywhere else the release is displayed. Uploading a
              new image replaces the current one.
            </p>
            {coverArt ? (
              <p className="mt-2 truncate text-xs text-content-tertiary" title={coverArt.fileName}>
                {coverArt.fileName} · {formatFileSize(coverArt.fileSize)}
                {coverArt.width && coverArt.height
                  ? ` · ${formatDimensions(coverArt.width, coverArt.height)}`
                  : ''}
              </p>
            ) : null}

            {/* The verdict on what is CURRENTLY on the release, so a
                below-spec image stays visibly below spec long after the upload
                that put it there. Shows nothing for an image whose dimensions
                were never recorded (uploaded before this existed, or through
                the general Files scene). */}
            <CoverArtDspNote grade={displayGrade} className="mt-2" />

            <div className="mt-3 flex flex-wrap gap-2">
              <input className="sr-only" {...upload.inputProps} />
              <button
                type="button"
                onClick={upload.openPicker}
                disabled={upload.isUploading}
                className="motion-focus motion-press inline-flex h-9 items-center gap-2 border border-brand/25 bg-brand px-3.5 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {upload.isUploading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    {coverArt ? 'Replace' : 'Choose file'}
                  </>
                )}
              </button>

              {upload.retryFile ? (
                <button
                  type="button"
                  onClick={upload.retry}
                  disabled={upload.isUploading}
                  className="motion-focus motion-press inline-flex h-9 items-center border border-stroke-default bg-bg-elevated px-3.5 text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-60"
                >
                  Retry
                </button>
              ) : null}

              {coverArt ? (
                <button
                  type="button"
                  onClick={() => void handleRemove()}
                  disabled={isRemoving || upload.isUploading}
                  className="motion-focus motion-press inline-flex h-9 items-center gap-2 border border-stroke-default bg-bg-elevated px-3.5 text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-60"
                >
                  {isRemoving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Remove
                </button>
              ) : null}
            </div>

            {upload.error ? (
              <p className="mt-3 text-xs text-status-error" role="alert">
                {upload.error}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {loadError ? (
        <div className="mt-4 border border-status-error/30 bg-status-error/5 p-4">
          <p className="text-sm text-content-primary">We could not load this release&apos;s cover art.</p>
          <p className="mt-1 text-xs text-content-secondary">{loadError}</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="motion-focus mt-3 text-xs font-semibold text-brand hover:underline"
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
