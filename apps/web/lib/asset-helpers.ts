/**
 * Server-side helpers for release asset uploads, validation, and signed-URL
 * generation. Used by the routes under `app/api/releases/[releaseId]/assets/*`.
 *
 * The release-assets bucket is private (storage RLS is not declared in
 * migrations — service-role access via the API is the v1 design). All read
 * access is through short-lived signed URLs.
 *
 * @see CLAUDE.md "v1 scope" item 4 — file/asset attachment to releases.
 */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types and constants
// ---------------------------------------------------------------------------

export type AssetCategory =
  | 'audio'
  | 'stems'
  | 'cover_art'
  | 'promo_image'
  | 'video'
  | 'document'
  | 'contract'
  | 'other';

export const ASSET_CATEGORIES: AssetCategory[] = [
  'audio',
  'stems',
  'cover_art',
  'promo_image',
  'video',
  'document',
  'contract',
  'other',
];

export const RELEASE_ASSETS_BUCKET = 'release-assets';
export const ASSET_SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour
// Supabase signed upload URLs default to a 2-hour TTL and aren't configurable
// per call. We surface this in the upload-url response so the client can plan.
export const ASSET_UPLOAD_URL_TTL_SECONDS = 60 * 60 * 2;

const MIB = 1024 * 1024;

export const ASSET_SIZE_LIMITS: Record<AssetCategory, number> = {
  audio: 100 * MIB,
  stems: 100 * MIB,
  cover_art: 10 * MIB,
  promo_image: 10 * MIB,
  video: 200 * MIB,
  document: 25 * MIB,
  contract: 25 * MIB,
  other: 25 * MIB,
};

const AUDIO_MIMES = ['audio/wav', 'audio/mpeg', 'audio/flac', 'audio/x-wav'];
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/webm'];
const DOCUMENT_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

export const ASSET_MIME_ALLOWLIST: Record<AssetCategory, string[]> = {
  audio: AUDIO_MIMES,
  stems: [...AUDIO_MIMES, 'application/zip'],
  cover_art: IMAGE_MIMES,
  promo_image: IMAGE_MIMES,
  video: VIDEO_MIMES,
  document: DOCUMENT_MIMES,
  contract: DOCUMENT_MIMES,
  other: [...AUDIO_MIMES, ...IMAGE_MIMES, ...VIDEO_MIMES, ...DOCUMENT_MIMES],
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function isAssetCategory(value: unknown): value is AssetCategory {
  return typeof value === 'string' && (ASSET_CATEGORIES as string[]).includes(value);
}

/**
 * Attributes a caller can validate against the category limits. Shaped as a
 * plain object so both the upload-url issuer (which has no File yet) and the
 * row-record endpoint (which has the uploaded object's metadata) can call this
 * with the same arguments.
 *
 * `file_name` is accepted for symmetry with the request body shape but is not
 * inspected — the storage path is generated server-side and the row's display
 * name is recorded verbatim.
 */
export type AssetUploadAttributes = {
  category: AssetCategory;
  mime_type: string;
  file_size: number;
  file_name: string;
};

/**
 * Validate an upload's attributes against the per-category size and MIME
 * limits. Returns a discriminated union so callers can surface the exact
 * reason.
 */
export function validateAssetUpload(
  attrs: AssetUploadAttributes
): { ok: true } | { ok: false; error: string } {
  const { category, mime_type, file_size } = attrs;

  const limit = ASSET_SIZE_LIMITS[category];
  if (file_size > limit) {
    const fileSizeMib = (file_size / MIB).toFixed(1);
    const limitMib = (limit / MIB).toFixed(0);
    return {
      ok: false,
      error: `File size ${fileSizeMib} MiB exceeds the ${limitMib} MiB limit for category "${category}".`,
    };
  }

  const allowed = ASSET_MIME_ALLOWLIST[category];
  const normalizedMime = mime_type || 'application/octet-stream';
  if (!allowed.includes(normalizedMime)) {
    return {
      ok: false,
      error: `MIME type "${normalizedMime}" is not allowed for category "${category}". Allowed: ${allowed.join(', ')}.`,
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Storage path
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Signed URL
// ---------------------------------------------------------------------------

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
