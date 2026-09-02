'use client';

import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { uploadSong, validateSongFile } from '@/lib/song';
import type { ReleaseSong } from '@/types/song';
import { isBrowserOnline } from '@/lib/offline/status';
import { enqueue, type QueuedMutation } from '@/lib/offline/queue';

const OFFLINE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_OFFLINE === 'true';

/**
 * Picking a song file and getting it onto a release, as one reusable piece of
 * state.
 *
 * Shared by the workspace's Song scene and the upload card UrgAns drops into a
 * conversation. Both surfaces need exactly the same four things — a file input
 * to drive, an uploading flag, an inline error, and a retry that re-runs from
 * step 1 — and the alternative was two copies of the same handful of `useState`
 * calls drifting apart the way AssetUploadControl's flow already had.
 *
 * The file input lives here (via `inputProps` + `openPicker`) rather than in the
 * consumers because of one browser rule worth stating: `input.click()` only
 * opens a dialog while the browser considers a user gesture to be in progress.
 * `openPicker` is therefore safe to call from a click handler and useless from
 * an effect — which is exactly why UrgAns hands the user a card with a button
 * on it instead of trying to pop a file dialog when the model asks for one.
 */
export type SongUploadState = {
  isUploading: boolean;
  /** Inline, non-toast message — a rejected file or a failed step. */
  error: string;
  /** True when the picked file was queued for offline sync instead of
   * uploaded — see useCoverArtUpload's identical field for the reasoning. */
  queued: boolean;
  /** The file a failed step 2 left behind, so a Retry can reuse it. */
  retryFile: File | null;
  /** Props for the (visually hidden) file input the consumer must render. */
  inputProps: {
    ref: React.RefObject<HTMLInputElement | null>;
    type: 'file';
    accept: string;
    disabled: boolean;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  };
  /** Open the OS file dialog. Only works inside a user gesture. */
  openPicker: () => void;
  /** Re-run the whole flow with the file a failed attempt left behind. */
  retry: () => void;
  clearError: () => void;
};

export function useSongUpload(params: {
  releaseId: string;
  accept: string;
  /** Fired once the row exists, with the created song. */
  onUploaded: (song: ReleaseSong) => void;
  /** Failures the user should see outside the card (session expiry, and the
   * "it uploaded but we could not record it" case). Optional — the inline
   * `error` covers everything on its own when no toast surface exists. */
  onToast?: (message: string, tone: 'success' | 'error' | 'warning') => void;
}): SongUploadState {
  const { releaseId, accept, onUploaded, onToast } = params;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [queued, setQueued] = useState(false);
  const [retryFile, setRetryFile] = useState<File | null>(null);

  const begin = useCallback(
    async (file: File) => {
      setError('');
      setRetryFile(null);
      setQueued(false);

      const validation = validateSongFile({
        name: file.name,
        type: file.type || '',
        size: file.size,
      });
      if (!validation.ok) {
        setError(validation.error);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      const userId = session?.user?.id || '';

      if (OFFLINE_ENABLED && !isBrowserOnline() && userId) {
        await enqueue<Extract<QueuedMutation, { kind: 'song_upload' }>>({
          kind: 'song_upload',
          userId,
          payload: { releaseId },
          blob: file,
        });
        setQueued(true);
        onToast?.("You're offline — this will upload when you're back online.", 'warning');
        return;
      }

      if (!token) {
        const message = 'Your session expired. Sign in again and retry.';
        setError(message);
        onToast?.(message, 'error');
        return;
      }

      setIsUploading(true);
      const result = await uploadSong({ releaseId, file, token });
      setIsUploading(false);

      if (result.ok) {
        onUploaded(result.song);
        return;
      }

      if (OFFLINE_ENABLED && result.retryable && !isBrowserOnline() && userId) {
        await enqueue<Extract<QueuedMutation, { kind: 'song_upload' }>>({
          kind: 'song_upload',
          userId,
          payload: { releaseId },
          blob: file,
        });
        setQueued(true);
        onToast?.("You're offline — this will upload when you're back online.", 'warning');
        return;
      }

      setError(result.error);
      // Only a pre-storage failure is worth a Retry button: past that the
      // bytes are up and the server has already cleaned up after itself, so
      // "try again" means starting over anyway.
      if (result.retryable) setRetryFile(file);
      else onToast?.(result.error, 'error');
    },
    [onToast, onUploaded, releaseId]
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset first, so picking the SAME file again still fires onChange.
      event.target.value = '';
      if (file) void begin(file);
    },
    [begin]
  );

  return {
    isUploading,
    error,
    queued,
    retryFile,
    inputProps: {
      ref: inputRef,
      type: 'file',
      accept,
      disabled: isUploading,
      onChange: handleChange,
    },
    openPicker: () => inputRef.current?.click(),
    retry: () => {
      if (retryFile) void begin(retryFile);
    },
    clearError: () => setError(''),
  };
}
