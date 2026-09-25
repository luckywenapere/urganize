/**
 * Uploading a press photo to a kit — the client-safe half.
 *
 * The fourth deliberate copy of the three-step signed-URL flow, after
 * `AssetUploadControl`, `lib/song.ts` and `lib/cover-art-upload.ts`. The rule
 * this codebase follows is duplicate across asset KINDS, share across surfaces
 * for the same kind, and a press photo is a new kind: its own ceiling, its own
 * grading, its own table, and a list rather than a replacement.
 *
 * That last difference is the one that matters. Cover art REPLACES whatever
 * came before, because a release has exactly one. A kit has a set of photos,
 * so this appends and `position` decides the order — the shape songs use.
 */

import type { PressKitAsset } from '@/types/press-kits';

export type PressPhotoUploadOutcome =
  | { ok: true; asset: PressKitAsset }
  | { ok: false; step: 1 | 2 | 3; error: string; retryable: boolean };

type UploadUrlResponse = { upload_url?: string; storage_path?: string; error?: string };
type RecordResponse = { asset?: PressKitAsset; error?: string };

/**
 * Add one photo to a kit.
 *
 *   1. POST .../assets/upload-url → a signed Supabase Storage upload URL
 *   2. PUT the file to that URL → straight to storage, never through our
 *      serverless function, which is what keeps the 10 MiB ceiling clear of
 *      Vercel's ~4.5 MB request body limit
 *   3. POST .../assets → record the row and get it back with a signed URL
 *
 * Step 3 retries once, because by then the bytes are already up and only the
 * record failed. Step 2 does not, since its signed URL may itself be what
 * expired, and re-PUTting to a dead URL just fails again more slowly.
 */
export async function uploadPressPhoto(params: {
  kitId: string;
  file: File;
  token: string;
  /** Measured by the picker to grade the file, so passing them here avoids
   *  decoding the same image twice. Optional: without them the row simply
   *  records no dimensions and reads back as unknown. */
  dimensions?: { width: number; height: number } | null;
  photographerCredit?: string;
  usageRights?: string;
  fetchImpl?: typeof fetch;
}): Promise<PressPhotoUploadOutcome> {
  const { kitId, file, token } = params;
  const doFetch = params.fetchImpl ?? fetch;
  const mimeType = file.type || 'application/octet-stream';

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  let uploadUrl = '';
  let storagePath = '';
  try {
    const response = await doFetch(`/api/press-kits/${kitId}/assets/upload-url`, {
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

  const record = async (): Promise<PressKitAsset> => {
    const response = await doFetch(`/api/press-kits/${kitId}/assets`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        storage_path: storagePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: mimeType,
        width: params.dimensions?.width,
        height: params.dimensions?.height,
        photographer_credit: params.photographerCredit,
        usage_rights: params.usageRights,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as RecordResponse;
    if (!response.ok || !data.asset) {
      throw new Error(data.error || 'Could not save the photo.');
    }
    return data.asset;
  };

  try {
    return { ok: true, asset: await record() };
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      return { ok: true, asset: await record() };
    } catch (err) {
      return {
        ok: false,
        step: 3,
        error:
          err instanceof Error
            ? err.message
            : 'The photo uploaded but we could not save it. Try again.',
        retryable: false,
      };
    }
  }
}

/**
 * Ask the server for a short lived download URL and go to it.
 *
 * The DJ pack pattern, for the same two reasons. The URL is minted on click
 * rather than rendered into the page, so a tab left open overnight does not
 * hold a set of live URLs. And it is NAVIGATED to rather than used with a
 * `download` attribute: the file is on another origin, where that attribute is
 * ignored, so the filename has to come from the signed URL's own
 * content-disposition instead. That is also what makes it work inside the
 * app webview, where a bare new-tab anchor to storage is the documented
 * highest-risk pattern.
 */
export async function requestPressPhotoDownload(params: {
  kitId: string;
  assetId: string;
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const doFetch = params.fetchImpl ?? fetch;
  try {
    const response = await doFetch(
      `/api/press-kits/${params.kitId}/assets/${params.assetId}/download`,
      { headers: { Authorization: `Bearer ${params.token}` } }
    );
    const data = (await response.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };
    if (!response.ok || !data.url) {
      return { ok: false, error: data.error || 'Could not prepare that download.' };
    }
    return { ok: true, url: data.url };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not prepare that download.',
    };
  }
}
