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

export {
  ASSET_CATEGORIES,
  ASSET_MIME_ALLOWLIST,
  ASSET_SIGNED_URL_TTL_SECONDS,
  ASSET_SIZE_LIMITS,
  ASSET_UPLOAD_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  categoryLabel,
  formatFileSize,
  isAssetCategory,
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
  try {
    const { data, error } = await supabaseClient.storage
      .from(bucket)
      .createSignedUrl(path, ttlSeconds);
    if (error || !data?.signedUrl) {
      console.error(`Signed URL generation failed for ${bucket}/${path}:`, error);
      return null;
    }
    return data.signedUrl;
  } catch (err) {
    console.error(`Signed URL generation threw for ${bucket}/${path}:`, err);
    return null;
  }
}
