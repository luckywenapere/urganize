/**
 * Client-safe constants and helpers for release assets — types, size limits,
 * MIME allowlists, label formatting, and the validation function.
 *
 * Imported by both client components and server routes. `asset-helpers.ts`
 * re-exports everything here so existing server-side imports keep working
 * without churn; the split exists so client bundles don't pull in node-only
 * modules.
 */

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
export const ASSET_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const ASSET_UPLOAD_URL_TTL_SECONDS = 60 * 60 * 2;

const MIB = 1024 * 1024;

// Tuned for Supabase Free plan headroom (50 MiB per-upload ceiling, 1 GiB
// total). Audio/stems/video are kept under the per-upload cap; cover art and
// images stay tight to preserve quota for masters and footage. Bump when the
// project moves to Pro.
export const ASSET_SIZE_LIMITS: Record<AssetCategory, number> = {
  audio: 40 * MIB,
  stems: 40 * MIB,
  cover_art: 5 * MIB,
  promo_image: 5 * MIB,
  video: 40 * MIB,
  document: 10 * MIB,
  contract: 10 * MIB,
  other: 10 * MIB,
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

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  cover_art: 'Cover art',
  promo_image: 'Promo image',
  audio: 'Audio',
  stems: 'Stems',
  video: 'Video',
  document: 'Document',
  contract: 'Contract',
  other: 'Other',
};

export function categoryLabel(category: AssetCategory): string {
  return CATEGORY_LABELS[category];
}

export function isAssetCategory(value: unknown): value is AssetCategory {
  return typeof value === 'string' && (ASSET_CATEGORIES as string[]).includes(value);
}

export type AssetUploadAttributes = {
  category: AssetCategory;
  mime_type: string;
  file_size: number;
  file_name: string;
};

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

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MIB) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / MIB).toFixed(1)} MiB`;
}
