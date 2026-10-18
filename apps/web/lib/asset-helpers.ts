/**
 * Server-side helpers for release asset uploads, validation, and signed-URL
 * generation. Used by the routes under `app/api/releases/[releaseId]/assets/*`.
 *
 * Client-safe constants and validation live in `./asset-constants.ts` and are
 * re-exported here so server-side import paths stay stable. The split exists
 * to keep node-only modules (node:crypto) out of client bundles.
 *
 * The release-assets bucket is private (storage RLS is not declared in
 * migrations — service-role access via the API is the v1 design). All read
 * access is through short-lived signed URLs.
 *
 * @see CLAUDE.md "v1 scope" item 4 — file/asset attachment to releases.
 */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssetCategory } from './asset-constants';
import { thumbPathFor } from './image-thumb';

export {
  ASSET_CATEGORIES,
  ASSET_MIME_ALLOWLIST,
  ASSET_SIGNED_URL_TTL_SECONDS,
  ASSET_SIZE_LIMITS,
  ASSET_UPLOAD_URL_TTL_SECONDS,
  MAX_WORKSPACE_LOGO_BYTES,
  RELEASE_ASSETS_BUCKET,
  categoryLabel,
  formatFileSize,
  isAssetCategory,
  isUploadableAssetCategory,
  UPLOADABLE_ASSET_CATEGORIES,
  validateAssetUpload,
} from './asset-constants';
export type { AssetCategory, AssetUploadAttributes } from './asset-constants';

/**
 * Sanitize a user-supplied filename for inclusion in a storage path.
 * Strips path separators, control characters, and non-ASCII characters; keeps
 * alphanumerics, dots, hyphens, and underscores; collapses whitespace to
 * hyphens. Falls back to "file" if the input has no preservable characters.
 */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:]/g, '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9.\-_]/g, '');
  return cleaned || 'file';
}

export function buildStoragePath(
  releaseId: string,
  category: AssetCategory,
  fileName: string
): string {
  return `${releaseId}/${category}/${randomUUID()}-${sanitizeFileName(fileName)}`;
}

// Signed-URL cache. Minting a fresh URL per request gave every response a
// different token, so browsers/CDN could never cache cover art or the
// workspace logo — every dashboard load re-downloaded every image. Reusing
// a URL until 80% of its TTL has elapsed keeps the URL string stable across
// requests (cache hit in the browser) while never handing out one that's
// close to expiry. Storage paths are UUID-suffixed and never reused, so a
// cached URL can't point at different content; a deleted asset's URL dies
// with its row (nothing renders it) and ages out of the cache on its own.
const SIGNED_URL_CACHE_MAX_ENTRIES = 500;
const signedUrlCache = new Map<string, { url: string; staleAt: number }>();

/**
 * Generate a signed download URL. Returns null (with console.error) on failure
 * so callers can degrade gracefully — listing twenty assets shouldn't 500 if
 * one signed-URL call hiccups.
 */
export async function generateSignedUrl(
  supabaseClient: SupabaseClient,
  bucket: string,
  path: string,
  ttlSeconds: number
): Promise<string | null> {
  const cacheKey = `${bucket}/${path}/${ttlSeconds}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.staleAt > Date.now()) {
    return cached.url;
  }

  try {
    const { data, error } = await supabaseClient.storage
      .from(bucket)
      .createSignedUrl(path, ttlSeconds);
    if (error || !data?.signedUrl) {
      console.error(`Signed URL generation failed for ${bucket}/${path}:`, error);
      return null;
    }

    if (signedUrlCache.size >= SIGNED_URL_CACHE_MAX_ENTRIES) {
      const oldestKey = signedUrlCache.keys().next().value;
      if (oldestKey !== undefined) {
        signedUrlCache.delete(oldestKey);
      }
    }
    signedUrlCache.set(cacheKey, {
      url: data.signedUrl,
      staleAt: Date.now() + ttlSeconds * 1000 * 0.8,
    });

    return data.signedUrl;
  } catch (err) {
    console.error(`Signed URL generation threw for ${bucket}/${path}:`, err);
    return null;
  }
}

// Thumbs that were looked for and are not there (uploads from before thumbs,
// or a browser that could not make one). Remembered briefly so a list of old
// covers does not ask storage again on every load; short enough that a
// backfilled thumb is picked up within minutes.
const MISSING_THUMB_TTL_MS = 10 * 60 * 1000;
const missingThumbUntil = new Map<string, number>();

/**
 * Signed URLs for the small display copies (lib/image-thumb.ts) of
 * `originalPaths`, keyed by ORIGINAL path. A path whose thumb does not exist
 * is simply absent, so callers fall back to the original. One batched storage
 * call for everything not already cached; never throws.
 */
export async function generateThumbSignedUrls(
  supabaseClient: SupabaseClient,
  bucket: string,
  originalPaths: string[],
  ttlSeconds: number
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const now = Date.now();
  const toSign: string[] = [];

  for (const original of Array.from(new Set(originalPaths.filter(Boolean)))) {
    const thumbPath = thumbPathFor(original);
    const cacheKey = `${bucket}/${thumbPath}/${ttlSeconds}`;
    const cached = signedUrlCache.get(cacheKey);
    if (cached && cached.staleAt > now) {
      result.set(original, cached.url);
      continue;
    }
    const missingUntil = missingThumbUntil.get(cacheKey);
    if (missingUntil && missingUntil > now) continue;
    toSign.push(original);
  }
  if (!toSign.length) return result;

  try {
    const { data, error } = await supabaseClient.storage
      .from(bucket)
      .createSignedUrls(toSign.map(thumbPathFor), ttlSeconds);
    if (error || !Array.isArray(data)) return result;

    const originalByThumb = new Map(toSign.map((original) => [thumbPathFor(original), original]));
    data.forEach((item, index) => {
      // Match on the path storage echoes back; fall back to order.
      const original = (item?.path && originalByThumb.get(item.path)) || toSign[index];
      if (!original) return;
      const cacheKey = `${bucket}/${thumbPathFor(original)}/${ttlSeconds}`;
      if (item?.error || !item?.signedUrl) {
        if (missingThumbUntil.size >= SIGNED_URL_CACHE_MAX_ENTRIES) missingThumbUntil.clear();
        missingThumbUntil.set(cacheKey, now + MISSING_THUMB_TTL_MS);
        return;
      }
      if (signedUrlCache.size >= SIGNED_URL_CACHE_MAX_ENTRIES) {
        const oldestKey = signedUrlCache.keys().next().value;
        if (oldestKey !== undefined) signedUrlCache.delete(oldestKey);
      }
      signedUrlCache.set(cacheKey, { url: item.signedUrl, staleAt: now + ttlSeconds * 1000 * 0.8 });
      result.set(original, item.signedUrl);
    });
  } catch (err) {
    console.error(`Thumb signed URL generation threw for ${bucket}:`, err);
  }
  return result;
}

/**
 * A signed PUT URL for the display copy of `storagePath` (`<path>.thumb`,
 * lib/image-thumb.ts), handed back next to the original's upload URL. Null on
 * any failure: the thumb is optional and must never fail the upload.
 */
export async function signThumbUploadUrl(
  supabaseClient: SupabaseClient,
  bucket: string,
  storagePath: string
): Promise<string | null> {
  try {
    const { data, error } = await supabaseClient.storage
      .from(bucket)
      .createSignedUploadUrl(thumbPathFor(storagePath));
    return error || !data?.signedUrl ? null : data.signedUrl;
  } catch {
    return null;
  }
}
