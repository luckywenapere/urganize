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
  | 'split_sheet'
  | 'other';

export const ASSET_CATEGORIES: AssetCategory[] = [
  'audio',
  'stems',
  'cover_art',
  'promo_image',
  'video',
  'document',
  'contract',
  'split_sheet',
  'other',
];

export const RELEASE_ASSETS_BUCKET = 'release-assets';
export const ASSET_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const ASSET_UPLOAD_URL_TTL_SECONDS = 60 * 60 * 2;

const MIB = 1024 * 1024;

// Tuned for Supabase Free plan headroom (50 MiB per-upload ceiling, 1 GiB
// total). Audio/stems/video are kept under the per-upload cap; promo images
// stay tight to preserve quota for masters and footage. Bump when the
// project moves to Pro.
//
// cover_art is the one deliberate exception at 25 MiB: DSPs require a square
// 3000x3000 image (lib/cover-art-dsp.ts), and a PNG at that size routinely
// runs past 10 MiB, so the old 5 MiB ceiling rejected exactly the files this
// product tells managers to produce. Safe because uploads go from the browser
// straight to Supabase Storage through a signed URL, never through a
// serverless function, so neither Vercel's ~4.5 MB request body limit nor its
// timeout applies here.
export const ASSET_SIZE_LIMITS: Record<AssetCategory, number> = {
  audio: 40 * MIB,
  stems: 40 * MIB,
  cover_art: 25 * MIB,
  promo_image: 5 * MIB,
  video: 40 * MIB,
  document: 10 * MIB,
  contract: 10 * MIB,
  split_sheet: 10 * MIB,
  other: 10 * MIB,
};

/**
 * Size ceiling for a workspace logo.
 *
 * Its OWN number, deliberately not `ASSET_SIZE_LIMITS.cover_art`, which both
 * halves of the logo flow used to read. That coupling broke the moment cover
 * art was raised to 25 MiB to fit the square 3000x3000 image DSPs require: a
 * logo rendered at 96px silently started accepting a 25 MiB upload, and the
 * Settings help text advertised it.
 *
 * The second victim of exactly that coupling — `MAX_CURATOR_PHOTO_BYTES` in
 * lib/pitching.ts was the first. A distributor deliverable and a 96px avatar
 * have no reason to move together. Both now carry a test asserting they are
 * NOT equal to the cover-art limit, which is what stops a third.
 *
 * The MIME allowlist is still shared with cover art (both are just "an image we
 * can display"), and that is fine: adding a format there is not a size change.
 */
export const MAX_WORKSPACE_LOGO_BYTES = 5 * MIB;

/**
 * Size ceiling for a press photo on a standing press kit.
 *
 * Its OWN literal, and never `ASSET_SIZE_LIMITS.cover_art` — that alias has
 * already widened two features by accident (see the comment above), and this
 * would have been the third. It is deliberately NOT `promo_image` either: a
 * promo image is a thumbnail, while a press photo is a deliverable a magazine
 * runs at 3000px, so 5 MiB rejects exactly the files this feature asks for.
 *
 * 10 MiB sits above promo_image and well under cover art. The tests either
 * side of it assert both halves of that.
 */
export const MAX_PRESS_PHOTO_BYTES = 10 * MIB;

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
  split_sheet: DOCUMENT_MIMES,
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
  split_sheet: 'Split sheet',
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
