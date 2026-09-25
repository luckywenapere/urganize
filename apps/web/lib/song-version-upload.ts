/**
 * Adding a file to a song — the client half.
 *
 * The three upload routes under /api/songs/[songId]/versions existed from the
 * start and nothing in the app ever called them (found 2026-09-25), so every
 * track on every DJ pack read "No file". This is the flow that finally uses
 * them, shaped after lib/song.ts (the release song upload) so the two agree
 * about how an upload behaves:
 *
 *   1. POST …/versions/upload-url → a signed Storage upload URL
 *   2. PUT the file to it          → the bytes go straight to storage, never
 *                                     through a serverless function
 *   3. POST …/versions             → record the file on the song
 *
 * Step 3 retries once, because the bytes are already up and losing the row to
 * one flaky write would waste the whole upload. Step 2 does not: its signed URL
 * may be what expired, so a retry starts again from step 1.
 *
 * Nothing here imports the Supabase client: the caller passes its token in and
 * every network call is injectable, so the whole flow runs in a unit test.
 */

import { guessVersionLabel, resolveSongVersionMimeType, validateSongVersionUpload } from '@/lib/song-versions';
import type { SongVersionLabel } from '@/lib/setlist';

export type UploadedSongFile = {
  id: string;
  songId: string;
  label: string;
  fileName: string;
  durationSeconds: number | null;
  createdAt: string;
};

export type SongFileUploadOutcome =
  | { ok: true; file: UploadedSongFile }
  | {
      ok: false;
      step: 1 | 2 | 3;
      error: string;
      /** True when trying the same file again could work. */
      retryable: boolean;
    };

/** PUTs the bytes and reports progress. Injected in tests; the default uses
 *  XMLHttpRequest, the one browser API that reports upload progress. */
export type PutFile = (input: {
  url: string;
  file: Blob;
  contentType: string;
  onProgress?: (fraction: number) => void;
}) => Promise<{ ok: boolean; status: number }>;

const readJson = async (response: Response): Promise<Record<string, unknown>> =>
  ((await response.json().catch(() => ({}))) || {}) as Record<string, unknown>;

const errorOf = (body: Record<string, unknown>, fallback: string): string =>
  typeof body.error === 'string' && body.error ? body.error : fallback;

export async function uploadSongFile(params: {
  songId: string;
  file: File;
  token: string;
  /** Defaults to a guess from the file name (guessVersionLabel). */
  label?: SongVersionLabel;
  /** Read from the file before upload when the browser can (readAudioDuration). */
  durationSeconds?: number | null;
  onProgress?: (fraction: number) => void;
  fetchImpl?: typeof fetch;
  putImpl?: PutFile;
  /** Pause before the one record retry. Zero in tests. */
  retryDelayMs?: number;
}): Promise<SongFileUploadOutcome> {
  const { songId, file, token } = params;
  const doFetch = params.fetchImpl ?? fetch;
  const doPut = params.putImpl ?? putWithProgress;

  const contentType = resolveSongVersionMimeType(file.name, file.type);
  const invalid = validateSongVersionUpload({
    fileName: file.name,
    mimeType: contentType ?? file.type,
    fileSize: file.size,
  });
  if (invalid || !contentType) {
    return {
      ok: false,
      step: 1,
      error: invalid?.message || 'That is not an audio file a DJ can load. Use MP3, WAV, AIFF, FLAC or M4A.',
      retryable: false,
    };
  }

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const details = { fileName: file.name, mimeType: contentType, fileSize: file.size };

  // Step 1 — a signed upload URL.
  let signedUrl = '';
  let storagePath = '';
  try {
    const response = await doFetch(`/api/songs/${songId}/versions/upload-url`, {
      method: 'POST',
      headers,
      body: JSON.stringify(details),
    });
    const body = await readJson(response);
    if (!response.ok || typeof body.signedUrl !== 'string' || typeof body.storagePath !== 'string') {
      return {
        ok: false,
        step: 1,
        error: errorOf(body, 'Couldn’t start the upload. Try again.'),
        // A refusal (too big, wrong type, no access) will refuse again; a
        // server hiccup might not.
        retryable: response.status >= 500,
      };
    }
    signedUrl = body.signedUrl;
    storagePath = body.storagePath;
  } catch {
    return {
      ok: false,
      step: 1,
      error: 'Couldn’t reach the server. Check your connection and try again.',
      retryable: true,
    };
  }

  // Step 2 — the bytes, straight to storage.
  params.onProgress?.(0);
  try {
    const put = await doPut({ url: signedUrl, file, contentType, onProgress: params.onProgress });
    if (!put.ok) {
      return {
        ok: false,
        step: 2,
        error: 'The upload didn’t finish. Check your connection and try again.',
        retryable: true,
      };
    }
  } catch {
    return {
      ok: false,
      step: 2,
      error: 'The upload didn’t finish. Check your connection and try again.',
      retryable: true,
    };
  }
  params.onProgress?.(1);

  // Step 3 — record it, with one quiet retry.
  const label = params.label ?? guessVersionLabel(file.name);
  const record = async (): Promise<UploadedSongFile> => {
    const response = await doFetch(`/api/songs/${songId}/versions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...details,
        storagePath,
        label,
        durationSeconds:
          typeof params.durationSeconds === 'number' && params.durationSeconds > 0
            ? Math.round(params.durationSeconds)
            : null,
      }),
    });
    const body = await readJson(response);
    const version = body.version as UploadedSongFile | undefined;
    if (!response.ok || !version?.id) {
      throw new Error(errorOf(body, 'The file uploaded but couldn’t be saved. Try again.'));
    }
    return version;
  };

  try {
    return { ok: true, file: await record() };
  } catch {
    await new Promise((resolve) => setTimeout(resolve, params.retryDelayMs ?? 1000));
    try {
      return { ok: true, file: await record() };
    } catch (caught) {
      return {
        ok: false,
        step: 3,
        error:
          caught instanceof Error && caught.message
            ? caught.message
            : 'The file uploaded but couldn’t be saved. Try again.',
        retryable: true,
      };
    }
  }
}

/** The default PUT: XMLHttpRequest, for its upload progress events. */
const putWithProgress: PutFile = ({ url, file, contentType, onProgress }) =>
  new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.setRequestHeader('Content-Type', contentType);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    request.onload = () => resolve({ ok: request.status >= 200 && request.status < 300, status: request.status });
    request.onerror = () => reject(new Error('network'));
    request.onabort = () => reject(new Error('aborted'));
    request.send(file);
  });

/**
 * A file's length in seconds, read by the browser before upload, or null when
 * it cannot tell (Chrome cannot decode AIFF, and a file can simply be odd).
 * Null is safe: the set's running total then asks for a length rather than
 * counting the song as nothing.
 */
export function readAudioDuration(file: Blob, timeoutMs = 5000): Promise<number | null> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      audio.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const seconds = audio.duration;
      finish(Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null);
    };
    audio.onerror = () => finish(null);
    audio.src = url;
  });
}
