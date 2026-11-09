'use client';

import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { uploadCoverArt, validateCoverArtFile } from '@/lib/cover-art-upload';
import { gradeCoverArt, type CoverArtGrade } from '@/lib/cover-art-dsp';
import { readImageDimensions } from '@/lib/cover-art-image';
import { coverArtUpscaleTarget, upscaleCoverArt } from '@/lib/upscale-cover-art';
import type { ReleaseCoverArt } from '@/types/cover-art';
import { isBrowserOnline } from '@/lib/offline/status';
import { enqueue, type QueuedMutation } from '@/lib/offline/queue';

const OFFLINE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_OFFLINE === 'true';

/**
 * Picking a cover art image and getting it onto a release, as one reusable
 * piece of state. The picker/uploading/retry shape, with the
 * `input.click()`-needs-a-user-gesture reasoning, kept as a SEPARATE hook
 * rather than a shared generic uploader, matching this codebase's own
 * precedent (`AssetUploadControl` is an independent implementation of the
 * same three-step flow rather than one parameterized abstraction).
 */
export type CoverArtUploadState = {
  isUploading: boolean;
  error: string;
  /**
   * How the last picked image measured against DSP requirements, or null
   * before anything has been picked. A 'blocked' grade is ALSO surfaced as
   * `error` (nothing uploaded); a 'warning' grade uploads and the caller keeps
   * showing this so a below-spec image stays visibly below spec.
   */
  grade: CoverArtGrade | null;
  /** True when the picked file was queued for offline sync instead of
   * uploaded — the release's actual cover art doesn't update until the
   * queue replays (lib/offline/sync.ts) on reconnect. */
  queued: boolean;
  retryFile: File | null;
  inputProps: {
    ref: React.RefObject<HTMLInputElement | null>;
    type: 'file';
    accept: string;
    disabled: boolean;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  };
  openPicker: () => void;
  /** Upload a file that arrived some other way (dropped on the square). */
  uploadFile: (file: File) => void;
  retry: () => void;
  clearError: () => void;
};

export function useCoverArtUpload(params: {
  releaseId: string;
  accept: string;
  onUploaded: (coverArt: ReleaseCoverArt) => void;
  onToast?: (message: string, tone: 'success' | 'error' | 'warning') => void;
}): CoverArtUploadState {
  const { releaseId, accept, onUploaded, onToast } = params;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const [grade, setGrade] = useState<CoverArtGrade | null>(null);
  const [queued, setQueued] = useState(false);
  // One upload at a time. `isUploading` used to drop to false while the image
  // was measured and again between the enlarge step and the upload, so a
  // second drop or pick in those gaps started a second upload whose result
  // could land after the first. The ref is the guard (it updates
  // synchronously); `isUploading` now spans the whole run so the spinner and
  // the disabled input tell the truth.
  const busyRef = useRef(false);

  const run = useCallback(
    async (pickedFile: File) => {
      let file = pickedFile;
      setError('');
      setRetryFile(null);
      setQueued(false);
      // The previous file's verdict must not sit above this file's error.
      setGrade(null);

      const validation = validateCoverArtFile({
        name: file.name,
        type: file.type || '',
        size: file.size,
      });
      if (!validation.ok) {
        setError(validation.error);
        return;
      }
      setIsUploading(true);

      // Measure before uploading, so a file no DSP would accept never becomes
      // the release's cover in the first place. Dimensions are then handed to
      // the record step rather than re-derived (see uploadCoverArt).
      let dimensions = await readImageDimensions(file);
      const pickedGrade = gradeCoverArt({
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        mimeType: file.type || '',
      });
      if (pickedGrade.verdict === 'blocked') {
        setGrade(pickedGrade);
        setError(`${pickedGrade.headline} ${pickedGrade.detail}`.trim());
        return;
      }

      // Square but under 3000: enlarge it to 3000 x 3000 before it goes up,
      // and say nothing about it (founder call, lib/upscale-cover-art.ts).
      // The spinner covers the wait. If the browser cannot do it, the
      // original goes up and grades as it always did.
      const upscaleTarget = coverArtUpscaleTarget(dimensions);
      if (upscaleTarget) {
        const enlarged = await upscaleCoverArt(file, upscaleTarget);
        if (enlarged) {
          file = enlarged.file;
          dimensions = enlarged.dimensions;
        }
      }

      setGrade(
        file === pickedFile
          ? pickedGrade
          : gradeCoverArt({ width: dimensions?.width ?? null, height: dimensions?.height ?? null, mimeType: file.type || '' })
      );

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      const userId = session?.user?.id || '';

      // Offline: getSession() is a local read, so this still works. Queue
      // the file rather than attempting a request that can only fail —
      // the release's cover art updates once the queue replays this on
      // reconnect (lib/offline/sync.ts).
      if (OFFLINE_ENABLED && !isBrowserOnline() && userId) {
        await enqueue<Extract<QueuedMutation, { kind: 'cover_art_upload' }>>({
          kind: 'cover_art_upload',
          userId,
          payload: { releaseId, dimensions: dimensions ?? null },
          blob: file,
        });
        setQueued(true);
        onToast?.("You're offline. This will upload when you're back online.", 'warning');
        return;
      }

      if (!token) {
        const message = 'Your session expired. Sign in again and retry.';
        setError(message);
        onToast?.(message, 'error');
        return;
      }

      const result = await uploadCoverArt({ releaseId, file, token, dimensions });

      if (result.ok) {
        onUploaded(result.coverArt);
        return;
      }

      // A retryable failure that happens to land while the browser has
      // ALREADY gone offline (the connection dropped mid-upload, not
      // before it started) gets the same queue treatment rather than a
      // Retry button that can only fail again.
      if (OFFLINE_ENABLED && result.retryable && !isBrowserOnline() && userId) {
        await enqueue<Extract<QueuedMutation, { kind: 'cover_art_upload' }>>({
          kind: 'cover_art_upload',
          userId,
          payload: { releaseId, dimensions: dimensions ?? null },
          blob: file,
        });
        setQueued(true);
        onToast?.("You're offline. This will upload when you're back online.", 'warning');
        return;
      }

      setError(result.error);
      if (result.retryable) setRetryFile(file);
      else onToast?.(result.error, 'error');
    },
    [onToast, onUploaded, releaseId]
  );

  const begin = useCallback(
    async (pickedFile: File) => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        await run(pickedFile);
      } finally {
        busyRef.current = false;
        setIsUploading(false);
      }
    },
    [run]
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) void begin(file);
    },
    [begin]
  );

  return {
    isUploading,
    error,
    grade,
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
    uploadFile: (file: File) => {
      if (!isUploading) void begin(file);
    },
    retry: () => {
      if (retryFile) void begin(retryFile);
    },
    clearError: () => setError(''),
  };
}
