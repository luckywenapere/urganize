'use client';

import { useCallback, useMemo, useState } from 'react';
import { Download, Loader2, Music, Trash2, Upload } from '@/components/icons';
import { formatFileSize } from '@/lib/asset-constants';
import { SONG_FILE_ACCEPT, SONG_FORMATS_LABEL, SONG_MAX_BYTES } from '@/lib/song';
import { supabase } from '@/lib/supabase/client';
import { openExternalUrl } from '@/lib/external-link';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { useSceneDataStore } from '@/stores/useSceneDataStore';
import type { ReleaseSong } from '@/types/song';
import { useSceneData } from './useSceneData';
import { useSongUpload } from './useSongUpload';

type SongSectionProps = {
  releaseId: string;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

/**
 * The song on a release — upload it, hear it back, hand it over, remove it.
 *
 * Cache-first but MEMORY-ONLY (see lib/scene-cache.ts): the payload carries 1h
 * signed Storage URLs, so re-opening within a session is instant and a new
 * session always re-signs rather than painting a play button that 403s.
 *
 * Usually one row. The list shape is deliberate rather than a one-slot design:
 * a release genuinely carries a radio edit alongside the master sometimes, and
 * a single slot would either refuse the second file or silently destroy the
 * first. Newest first, and the newest is what every other surface means by
 * "the song".
 */
export function SongSection({ releaseId, onToast }: SongSectionProps) {
  const { data, isLoading, error: loadError, reload } = useSceneData(releaseId, 'song');
  const setScene = useSceneDataStore((state) => state.setScene);
  const songs = useMemo(() => data?.songs ?? [], [data]);
  const [deletingId, setDeletingId] = useState('');

  const handleUploaded = useCallback(
    (song: ReleaseSong) => {
      // The record POST already returns the row with its signed URL, so write
      // it straight through instead of re-fetching the list. Prepended, which
      // is where a reload would put it (the GET orders newest first).
      setScene(releaseId, 'song', { songs: [song, ...songs] });
      onToast(`Uploaded "${song.fileName}".`, 'success');
    },
    [onToast, releaseId, setScene, songs]
  );

  const upload = useSongUpload({
    releaseId,
    accept: SONG_FILE_ACCEPT,
    onUploaded: handleUploaded,
    onToast,
  });

  const handleDelete = async (song: ReleaseSong) => {
    if (!window.confirm(`Remove "${song.fileName}"? This cannot be undone.`)) return;

    setDeletingId(song.id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      if (!token) {
        onToast('Your session expired. Sign in again and retry.', 'error');
        return;
      }

      const response = await fetch(
        `/api/releases/${releaseId}/song?songId=${encodeURIComponent(song.id)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        onToast(body.error || 'Could not remove the song.', 'error');
        return;
      }

      setScene(releaseId, 'song', { songs: songs.filter((item) => item.id !== song.id) });
      onToast('Removed.', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not remove the song.', 'error');
    } finally {
      setDeletingId('');
    }
  };

  return (
    <div className="mt-8">
      {/* The upload control leads, always — this scene exists to receive a
          file, so the way in should not sit below a list on a release that
          already has one. */}
      <div className="border border-stroke-default bg-bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-content-primary">
              {songs.length ? 'Upload another version' : 'Upload the song'}
            </p>
            <p className="mt-1 text-xs text-content-secondary">
              {SONG_FORMATS_LABEL}, up to {formatFileSize(SONG_MAX_BYTES)}. Only your team can hear
              it — nothing here is public.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {/* A hidden input plus a real button, rather than an <input> inside
                a <label>: the same control is driven from UrgAns's upload card,
                which needs a programmatic openPicker() to exist. */}
            <input className="sr-only" {...upload.inputProps} />
            <button
              type="button"
              onClick={upload.openPicker}
              disabled={upload.isUploading}
              className="motion-focus motion-press inline-flex h-10 items-center gap-2 border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {upload.isUploading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  Choose file
                </>
              )}
            </button>

            {upload.retryFile ? (
              <button
                type="button"
                onClick={upload.retry}
                disabled={upload.isUploading}
                className="motion-focus motion-press inline-flex h-10 items-center border border-stroke-default bg-bg-elevated px-4 text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-60"
              >
                Retry
              </button>
            ) : null}
          </div>
        </div>

        {upload.error ? (
          <p className="mt-3 text-xs text-status-error" role="alert">
            {upload.error}
          </p>
        ) : null}
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="space-y-3">
            <SkeletonBlock className="h-20 w-full" />
            <SkeletonBlock className="h-20 w-full" />
          </div>
        ) : loadError ? (
          // Distinguished from "no song yet" on purpose: telling someone their
          // master is missing when the request merely failed is the worse of
          // the two lies.
          <div className="border border-status-error/30 bg-status-error/5 p-4">
            <p className="text-sm text-content-primary">We could not load this release&apos;s song.</p>
            <p className="mt-1 text-xs text-content-secondary">{loadError}</p>
            <button
              type="button"
              onClick={() => void reload()}
              className="motion-focus mt-3 text-xs font-semibold text-brand hover:underline"
            >
              Try again
            </button>
          </div>
        ) : songs.length === 0 ? (
          <div className="border border-dashed border-stroke-default p-8 text-center">
            <Music className="mx-auto h-5 w-5 text-content-tertiary" aria-hidden="true" />
            <p className="mt-3 text-sm text-content-primary">No song on this release yet.</p>
            <p className="mt-1 text-xs text-content-secondary">
              Upload the master and it travels with the release — ready when you pitch it or hand it
              to a distributor.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {songs.map((song, index) => (
              <SongRow
                key={song.id}
                song={song}
                isCurrent={index === 0}
                isDeleting={deletingId === song.id}
                onDelete={() => void handleDelete(song)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SongRow({
  song,
  isCurrent,
  isDeleting,
  onDelete,
}: {
  song: ReleaseSong;
  isCurrent: boolean;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  return (
    <li className="border border-stroke-default bg-bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-content-primary" title={song.fileName}>
            {song.fileName}
          </p>
          <p className="mt-1 text-xs text-content-tertiary">
            {formatFileSize(song.fileSize)}
            {isCurrent ? ' · current song' : ''}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {song.downloadUrl ? (
            <button
              type="button"
              // Routed through openExternalUrl rather than a target="_blank"
              // anchor: a bare new-tab link to a remote Storage URL commonly
              // opens blank inside the Capacitor webview.
              onClick={() => void openExternalUrl(song.downloadUrl as string)}
              aria-label={`Download ${song.fileName}`}
              className="motion-focus inline-flex h-8 w-8 items-center justify-center text-content-tertiary transition-colors hover:text-content-primary"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            aria-label={`Remove ${song.fileName}`}
            className="motion-focus inline-flex h-8 w-8 items-center justify-center text-content-tertiary transition-colors hover:text-status-error disabled:opacity-60"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Playback is the point of having the file here rather than in a folder
          somewhere: checking you uploaded the right master should not require
          downloading it. The signed URL is short-lived, which is the whole
          reason this scene is never cached to disk. */}
      {song.downloadUrl ? (
        <audio controls preload="none" src={song.downloadUrl} className="mt-3 w-full">
          Your browser cannot play this file.
        </audio>
      ) : (
        <p className="mt-3 text-xs text-content-tertiary">
          The playback link expired. Reopen this scene to refresh it.
        </p>
      )}
    </li>
  );
}
