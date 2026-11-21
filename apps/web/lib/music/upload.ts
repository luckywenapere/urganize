/**
 * Putting a song on Urganize music, the browser half. Three steps, the same
 * shape as the cover art upload:
 *
 *   1. POST /music/upload-url  a signed storage URL
 *   2. PUT the file to it      straight to storage, never through a function
 *   3. POST /music             record the song (as a draft, or swap a file)
 *
 * Step 3 retries once, because by then the bytes are already up and losing the
 * record would waste a 30 MB upload. Step 2 does not retry on its own: its
 * signed URL may itself be what expired, so the caller offers a fresh attempt.
 *
 * The result says which step failed and whether trying again could help, so the
 * screen can say "the upload did not finish" rather than a bare "failed".
 */

import { validateMusicFile } from './rules';
import type { OwnerTrack } from './server';

export type MusicUploadOutcome =
  | { ok: true; track: OwnerTrack }
  | { ok: false; step: 0 | 1 | 2 | 3; error: string; retryable: boolean };

type UploadUrlResponse = { upload_url?: string; storage_path?: string; error?: string };
type RecordResponse = { track?: OwnerTrack; error?: string };

export async function uploadMusic(params: {
  releaseId: string;
  file: Pick<File, 'name' | 'type' | 'size'> & Blob;
  token: string;
  durationSeconds?: number | null;
  /** Swap the file of this song instead of adding a new one. */
  replaceTrackId?: string;
  fetchImpl?: typeof fetch;
}): Promise<MusicUploadOutcome> {
  const { releaseId, file, token } = params;
  const doFetch = params.fetchImpl ?? fetch;
  const mimeType = (file.type || '').toLowerCase();

  // The same check the server makes, so a wrong file fails before 30 MB moves.
  const check = validateMusicFile({ name: file.name, type: mimeType, size: file.size });
  if (!check.ok) return { ok: false, step: 0, error: check.error, retryable: false };

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  let uploadUrl = '';
  let storagePath = '';
  try {
    const response = await doFetch(`/api/releases/${releaseId}/music/upload-url`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ file_name: file.name, mime_type: mimeType, file_size: file.size }),
    });
    const data = (await response.json().catch(() => ({}))) as UploadUrlResponse;
    if (!response.ok || !data.upload_url || !data.storage_path) {
      return { ok: false, step: 1, error: data.error || 'Could not start the upload.', retryable: false };
    }
    uploadUrl = data.upload_url;
    storagePath = data.storage_path;
  } catch (err) {
    return {
      ok: false,
      step: 1,
      error: err instanceof Error ? err.message : 'Could not start the upload.',
      retryable: true,
    };
  }

  try {
    const response = await doFetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: file,
    });
    if (!response.ok) {
      return {
        ok: false,
        step: 2,
        error: `The upload did not finish (${response.status}).`,
        retryable: true,
      };
    }
  } catch (err) {
    return {
      ok: false,
      step: 2,
      error: err instanceof Error ? err.message : 'The upload did not finish.',
      retryable: true,
    };
  }

  const record = async (): Promise<OwnerTrack> => {
    const response = await doFetch(`/api/releases/${releaseId}/music`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        storage_path: storagePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: mimeType,
        duration_seconds: params.durationSeconds ?? undefined,
        replace_track_id: params.replaceTrackId,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as RecordResponse;
    if (!response.ok || !data.track) throw new Error(data.error || 'Could not save the song.');
    return data.track;
  };

  try {
    return { ok: true, track: await record() };
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      return { ok: true, track: await record() };
    } catch (err) {
      return {
        ok: false,
        step: 3,
        error: err instanceof Error ? err.message : 'The song uploaded but we could not save it. Try again.',
        retryable: false,
      };
    }
  }
}

/**
 * The length of an audio file, read in the browser before it is uploaded, or
 * null if the browser cannot tell within a few seconds. Never rejects: a song
 * with no length still uploads and plays, it just shows no length.
 */
export function readAudioDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), 4000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () =>
      finish(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null);
    audio.onerror = () => finish(null);
    audio.src = url;
  });
}
