'use client';

import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import {
  readAudioDuration,
  uploadSongFile,
  type UploadedSongFile,
} from '@/lib/song-version-upload';

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; fileName: string; progress: number }
  | { status: 'error'; message: string; retryable: boolean };

/**
 * Picker, progress and retry for adding a file to a song. One hook for every
 * place a set row offers "Add a file", so they cannot disagree about limits or
 * about what a failure says (the useSongUpload pattern for release songs).
 */
export function useSongFileUpload(options: {
  songId: string | null;
  onUploaded: (file: UploadedSongFile) => void;
}) {
  const { songId, onUploaded } = options;
  const [state, setState] = useState<UploadState>({ status: 'idle' });
  const lastFile = useRef<File | null>(null);

  const start = useCallback(
    async (file: File) => {
      if (!songId) return;
      lastFile.current = file;
      setState({ status: 'uploading', fileName: file.name, progress: 0 });

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      if (!token) {
        setState({ status: 'error', message: 'You’re signed out. Sign in and try again.', retryable: false });
        return;
      }

      // Read the length first, so the set's total can fill in the moment the
      // file lands. Null (an AIFF in Chrome, an odd file) is fine: the total
      // then asks for a length instead.
      const durationSeconds = await readAudioDuration(file);

      const outcome = await uploadSongFile({
        songId,
        file,
        token,
        durationSeconds,
        onProgress: (fraction) =>
          setState((current) =>
            current.status === 'uploading' ? { ...current, progress: fraction } : current
          ),
      });

      if (outcome.ok) {
        setState({ status: 'idle' });
        lastFile.current = null;
        onUploaded(outcome.file);
        return;
      }
      setState({ status: 'error', message: outcome.error, retryable: outcome.retryable });
    },
    [onUploaded, songId]
  );

  const retry = useCallback(() => {
    if (lastFile.current) void start(lastFile.current);
  }, [start]);

  const dismiss = useCallback(() => setState({ status: 'idle' }), []);

  return { state, start, retry, dismiss };
}
