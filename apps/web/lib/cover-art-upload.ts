/**
 * Cover art upload — the client-safe half.
 *
 * Deliberately a SEPARATE module from `lib/cover-art.ts`, which is the bulk
 * signed-URL resolver `/api/releases` and `ReleaseService` use to paint every
 * card's thumbnail — that module has nothing to do with uploading, and this
 * one has nothing to do with resolving a batch, so keeping them apart avoids
 * either growing into a file about two different jobs.
 *
 * Its own constants, validation and three-step signed-URL flow rather than
 * sharing code with `AssetUploadControl`: the "similar files over a premature
 * abstraction" call this codebase makes across asset kinds. The load-bearing
 * difference: a release has at most ONE current cover art. Uploading a new
 * one REPLACES it — the record route deletes whatever `artwork_asset_id`
 * pointed at before pointing it at the new upload — rather than accumulating
 * versions.
 */

import {
  ASSET_MIME_ALLOWLIST,
  ASSET_SIZE_LIMITS,
  formatFileSize,
  type AssetCategory,
} from './asset-constants';
import type { ReleaseCoverArt } from '@/types/cover-art';
import { uploadThumb } from './image-thumb-client';

export const COVER_ART_CATEGORY: AssetCategory = 'cover_art';

export const COVER_ART_MIME_TYPES: readonly string[] = ASSET_MIME_ALLOWLIST[COVER_ART_CATEGORY];
export const COVER_ART_MAX_BYTES: number = ASSET_SIZE_LIMITS[COVER_ART_CATEGORY];

/** The `accept` attribute for a cover art file input. */
export const COVER_ART_FILE_ACCEPT = COVER_ART_MIME_TYPES.join(',');

/**
 * What the picker tells the user to bring. Says JPEG or PNG even though the
 * MIME allowlist still accepts WebP: WebP displays fine in the product but no
 * DSP ingests it, so it is graded down to a warning rather than advertised.
 * See lib/cover-art-dsp.ts.
 */
export const COVER_ART_FORMATS_LABEL = 'JPEG or PNG';

export type CoverArtValidationResult = { ok: true } | { ok: false; error: string };

export function validateCoverArtFile(file: {
  name: string;
  type: string;
  size: number;
}): CoverArtValidationResult {
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, error: 'That file is empty.' };
  }

  if (file.size > COVER_ART_MAX_BYTES) {
    return {
      ok: false,
      error: `That image is ${formatFileSize(file.size)}. Cover art has to be under ${formatFileSize(
        COVER_ART_MAX_BYTES
      )}.`,
    };
  }

  if (!COVER_ART_MIME_TYPES.includes(file.type || '')) {
    return {
      ok: false,
      error: `That is not an image we can take. Use ${COVER_ART_FORMATS_LABEL}.`,
    };
  }

  return { ok: true };
}

export type CoverArtUploadOutcome =
  | { ok: true; coverArt: ReleaseCoverArt }
  | { ok: false; step: 1 | 2 | 3; error: string; retryable: boolean };

type UploadUrlResponse = {
  upload_url?: string;
  storage_path?: string;
  /** Where the 384px display copy goes (lib/image-thumb.ts); optional. */
  thumb_upload_url?: string | null;
  error?: string;
};
type RecordResponse = { coverArt?: ReleaseCoverArt; error?: string };

/**
 * Put a new cover art on a release. Three steps, the same shape `uploadSong`
 * uses:
 *
 *   1. POST /cover-art/upload-url → a signed Supabase Storage upload URL
 *   2. PUT the file to that URL → straight to storage, never through our
 *      serverless function
 *   3. POST /cover-art → record the row; the server replaces whatever cover
 *      art existed before and returns the new one with a signed URL
 *
 * Step 3 retries once (the bytes are already up by then); step 2 does not
 * auto-retry, since its signed URL may itself be what expired.
 */
export async function uploadCoverArt(params: {
  releaseId: string;
  file: File;
  token: string;
  /**
   * Pixel dimensions, already measured by the caller (the picker has to
   * measure them anyway to grade the file, so re-decoding here would be
   * wasted work). Optional: an upload from a path that never measured still
   * records, it just stores no dimensions and reads as unknown afterwards.
   */
  dimensions?: { width: number; height: number } | null;
  fetchImpl?: typeof fetch;
}): Promise<CoverArtUploadOutcome> {
  const { releaseId, file, token } = params;
  const doFetch = params.fetchImpl ?? fetch;
  const mimeType = file.type || 'application/octet-stream';

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  let uploadUrl = '';
  let storagePath = '';
  let thumbUploadUrl: string | null = null;
  try {
    const response = await doFetch(`/api/releases/${releaseId}/cover-art/upload-url`, {
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
    thumbUploadUrl = typeof data.thumb_upload_url === 'string' ? data.thumb_upload_url : null;
  } catch (err) {
    return {
      ok: false,
      step: 1,
      error: err instanceof Error ? err.message : 'Could not start the upload.',
      retryable: true,
    };
  }

  // The small display copy, made and sent alongside the master. Best effort
  // and time boxed (lib/image-thumb-client.ts): it never fails the upload,
  // and it lands before step 3 so the lists that reload after the save
  // already read it.
  const thumbDone = uploadThumb(thumbUploadUrl, file, doFetch);

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

  await thumbDone;

  const record = async (): Promise<ReleaseCoverArt> => {
    const response = await doFetch(`/api/releases/${releaseId}/cover-art`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        storage_path: storagePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: mimeType,
        width: params.dimensions?.width,
        height: params.dimensions?.height,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as RecordResponse;
    if (!response.ok || !data.coverArt) {
      throw new Error(data.error || 'Could not save the cover art.');
    }
    return data.coverArt;
  };

  try {
    return { ok: true, coverArt: await record() };
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      return { ok: true, coverArt: await record() };
    } catch (err) {
      return {
        ok: false,
        step: 3,
        error:
          err instanceof Error
            ? err.message
            : 'The image uploaded but we could not save it. Try again.',
        retryable: false,
      };
    }
  }
}
