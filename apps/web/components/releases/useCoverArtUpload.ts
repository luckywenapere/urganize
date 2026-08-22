'use client';

import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { uploadCoverArt, validateCoverArtFile } from '@/lib/cover-art-upload';
import { gradeCoverArt, type CoverArtGrade } from '@/lib/cover-art-dsp';
import { readImageDimensions } from '@/lib/cover-art-image';
import type { ReleaseCoverArt } from '@/types/cover-art';

/**
 * Picking a cover art image and getting it onto a release, as one reusable
 * piece of state. Mirrors `useSongUpload` — same picker/uploading/retry
 * shape, same `input.click()`-needs-a-user-gesture reasoning — kept as a
 * SEPARATE hook rather than a shared generic uploader, matching this
 * codebase's own precedent (`AssetUploadControl` and `useSongUpload` are
 * independent implementations of the same three-step flow rather than one
 * parameterized abstraction).
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
  retryFile: File | null;
  inputProps: {
    ref: React.RefObject<HTMLInputElement | null>;
    type: 'file';
    accept: string;
    disabled: boolean;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  };
  openPicker: () => void;
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

  const begin = useCallback(
    async (file: File) => {
      setError('');
      setRetryFile(null);

      const validation = validateCoverArtFile({
        name: file.name,
        type: file.type || '',
        size: file.size,
      });
      if (!validation.ok) {
        setError(validation.error);
        return;
      }

      // Measure before uploading, so a file no DSP would accept never becomes
      // the release's cover in the first place. Dimensions are then handed to
      // the record step rather than re-derived (see uploadCoverArt).
      const dimensions = await readImageDimensions(file);
      const dspGrade = gradeCoverArt({
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        mimeType: file.type || '',
      });
      setGrade(dspGrade);
      if (dspGrade.verdict === 'blocked') {
        setError(`${dspGrade.headline} ${dspGrade.detail}`.trim());
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      if (!token) {
        const message = 'Your session expired. Sign in again and retry.';
        setError(message);
        onToast?.(message, 'error');
        return;
      }

      setIsUploading(true);
      const result = await uploadCoverArt({ releaseId, file, token, dimensions });
      setIsUploading(false);

      if (result.ok) {
        onUploaded(result.coverArt);
        return;
      }

      setError(result.error);
      if (result.retryable) setRetryFile(file);
      else onToast?.(result.error, 'error');
    },
    [onToast, onUploaded, releaseId]
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
