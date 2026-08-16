/**
 * Song upload — the client-safe half.
 *
 * Constants, validation, and the three-step upload flow, shared by BOTH
 * surfaces that can put a song on a release: the workspace's Song scene and the
 * upload card UrgAns drops into the conversation. One implementation on
 * purpose — the two entry points must agree about limits, accepted formats and
 * retry behaviour, and the earlier duplicate-the-flow approach is what left
 * AssetUploadControl as the only place that knew any of it.
 *
 * Nothing here imports the Supabase client or anything node-only: the caller
 * passes its access token in. That keeps the module importable from a plain
 * unit test, which is where the validation rules are pinned.
 *
 * The numbers are NOT redefined here. A song is an `assets` row with
 * `category: 'audio'`, so the size ceiling and the MIME allowlist come from
 * lib/asset-constants.ts, the same source the server validates against. Only
 * the COPY is ours — the shared validator's messages name the enum value and
 * read like a stack trace, which is fine in a developer-facing file cabinet and
 * wrong on a surface whose whole job is "put your song here".
 */

import {
  ASSET_MIME_ALLOWLIST,
  ASSET_SIZE_LIMITS,
  formatFileSize,
  type AssetCategory,
} from './asset-constants';
import type { ReleaseSong } from '@/types/song';

/** A song IS an audio asset. Everything else about the storage model follows. */
export const SONG_CATEGORY: AssetCategory = 'audio';

export const SONG_MIME_TYPES: readonly string[] = ASSET_MIME_ALLOWLIST[SONG_CATEGORY];
export const SONG_MAX_BYTES: number = ASSET_SIZE_LIMITS[SONG_CATEGORY];

/**
 * The `accept` attribute for a song file input. MIME types only, matching the
 * allowlist exactly — widening this with extensions would let the picker offer
 * files that validation then rejects, which is a worse experience than a picker
 * that simply greys them out.
 */
export const SONG_FILE_ACCEPT = SONG_MIME_TYPES.join(',');

/** Human list of what we take, for empty-state and error copy. */
export const SONG_FORMATS_LABEL = 'WAV, MP3 or FLAC';

export type SongValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Manager-voice validation, run before a byte leaves the browser. The server
 * re-runs the shared `validateAssetUpload` on both the upload-url and the
 * record call, so this is a courtesy, not the guard.
 */
export function validateSongFile(file: {
  name: string;
  type: string;
  size: number;
}): SongValidationResult {
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, error: 'That file is empty.' };
  }

  if (file.size > SONG_MAX_BYTES) {
    return {
      ok: false,
      // Names the actual way out. The ceiling is the Supabase Free plan's
      // per-upload headroom, so "compress it" is the real advice, not "upgrade".
      error: `That file is ${formatFileSize(file.size)} — songs have to be under ${formatFileSize(
        SONG_MAX_BYTES
      )}. Upload an MP3 rather than the WAV master.`,
    };
  }

  if (!SONG_MIME_TYPES.includes(file.type || '')) {
    return {
      ok: false,
      error: `That is not an audio file we can take. Use ${SONG_FORMATS_LABEL}.`,
    };
  }

  return { ok: true };
}

export type SongUploadOutcome =
  | { ok: true; song: ReleaseSong }
  /**
   * `step` is what the caller needs to decide whether a retry is worth
   * offering: step 2 failed before the bytes landed, so retrying from step 1
   * with the same file is the right move. The other two are already terminal by
   * the time this returns.
   */
  | { ok: false; step: 1 | 2 | 3; error: string; retryable: boolean };

type UploadUrlResponse = { upload_url?: string; storage_path?: string; error?: string };
type RecordResponse = { song?: ReleaseSong; error?: string };

/**
 * Put a song on a release. Three steps, mirroring the release-assets flow the
 * app already uses:
 *
 *   1. POST /song/upload-url  → a signed Supabase Storage upload URL
 *   2. PUT the file to that URL → the bytes go straight to storage, never
 *      through our serverless function (Vercel caps request bodies well below
 *      a 40 MiB master)
 *   3. POST /song → record the row and get a signed download URL back
 *
 * Step 3 retries once: the bytes are already up by then, so losing the row to
 * one flaky write would waste the whole upload. Step 2 does NOT auto-retry —
 * its signed URL may be the thing that expired, so the caller re-runs from
 * step 1 instead.
 */
export async function uploadSong(params: {
  releaseId: string;
  file: File;
  token: string;
  /** Injected in tests; defaults to the global. */
  fetchImpl?: typeof fetch;
}): Promise<SongUploadOutcome> {
  const { releaseId, file, token } = params;
  const doFetch = params.fetchImpl ?? fetch;
  const mimeType = file.type || 'application/octet-stream';

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Step 1 — signed upload URL.
  let uploadUrl = '';
  let storagePath = '';
  try {
    const response = await doFetch(`/api/releases/${releaseId}/song/upload-url`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        file_name: file.name,
        mime_type: mimeType,
        file_size: file.size,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as UploadUrlResponse;
    if (!response.ok || !data.upload_url || !data.storage_path) {
      return {
        ok: false,
        step: 1,
        error: data.error || 'Could not start the upload.',
        retryable: false,
      };
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

  // Step 2 — the bytes, direct to storage.
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

  // Step 3 — record the row, with one silent retry.
  const record = async (): Promise<ReleaseSong> => {
    const response = await doFetch(`/api/releases/${releaseId}/song`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        storage_path: storagePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: mimeType,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as RecordResponse;
    if (!response.ok || !data.song) {
      throw new Error(data.error || 'Could not save the song.');
    }
    return data.song;
  };

  try {
    return { ok: true, song: await record() };
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      return { ok: true, song: await record() };
    } catch (err) {
      return {
        ok: false,
        step: 3,
        // The server cleans up the orphaned object when the row insert fails,
        // so "upload it again" is honest advice rather than a way to leak bytes.
        error:
          err instanceof Error
            ? err.message
            : 'The file uploaded but we could not save it. Try again.',
        retryable: false,
      };
    }
  }
}
