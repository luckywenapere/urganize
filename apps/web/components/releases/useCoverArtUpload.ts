'use client';

import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { uploadCoverArt, validateCoverArtFile } from '@/lib/cover-art-upload';
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
      const result = await uploadCoverArt({ releaseId, file, token });
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
