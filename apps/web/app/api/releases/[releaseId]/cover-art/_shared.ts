import { NextResponse } from 'next/server';
import { createAdminClient } from '@/app/api/_shared/auth';
import {
  ASSET_SIGNED_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  generateSignedUrl,
} from '@/lib/asset-helpers';
import { COVER_ART_CATEGORY } from '@/lib/cover-art-upload';
import type { ReleaseCoverArt } from '@/types/cover-art';

/**
 * Shared helpers for the cover-art route group — mirrors the song route
 * group's `_shared.ts` (URG-... song upload) exactly in shape: the feature
 * flag, the local ownership check, the row mapper, and the "what is this
 * release's current cover art" read every handler needs.
 *
 * NO schema-missing fallback here, deliberately, for the same reason the
 * song group has none: environments are assumed migrated (CLAUDE.md,
 * "Patterns being deprecated in v1"), and `lib/schema-fallback-guard.test.ts`
 * fails the build for any new file that reaches for those helpers.
 */

export {
  getAuthenticatedUser,
  requireActiveAuthenticatedUser,
  createAdminClient,
} from '@/app/api/_shared/auth';

export const ASSETS_TABLE = 'assets';
export const RELEASES_TABLE = 'releases';

/**
 * The whole cover-art surface stays dark until this is 'true' — the scene,
 * its menu entry, and every handler below. Checked FIRST in each handler so
 * a direct API call cannot reach the feature either.
 *
 * Its own flag rather than `NEXT_PUBLIC_FEATURE_FILES`, for the same reason
 * song upload got its own: the founder switched the general file cabinet
 * off, and "update this release's cover image" is a different, more central
 * ask than "bring the file manager back" — even though both share the same
 * `assets` table and `release-assets` bucket underneath.
 */
export const isCoverArtFeatureEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_COVER_ART === 'true';

export const notFoundResponse = (): NextResponse =>
  NextResponse.json({ error: 'Not found.' }, { status: 404 });

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export async function ensureReleaseOwnership(
  adminClient: AdminClient,
  releaseId: string,
  userId: string
): Promise<{ error: NextResponse } | { releaseId: string; ownerUserId: string }> {
  const { data: release, error } = await adminClient
    .from(RELEASES_TABLE)
    .select('id,owner_user_id')
    .eq('id', releaseId)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load release.' },
        { status: 500 }
      ),
    };
  }

  if (!release || String(release.owner_user_id || '') !== userId) {
    return { error: NextResponse.json({ error: 'Release not found.' }, { status: 404 }) };
  }

  return { releaseId: String(release.id || ''), ownerUserId: String(release.owner_user_id || '') };
}

type AssetRow = {
  id: string;
  release_id: string | null;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  storage_bucket: string | null;
  storage_path: string;
  created_at: string;
};

const COVER_ART_COLUMNS =
  'id,release_id,file_name,file_size,mime_type,storage_bucket,storage_path,created_at';

export function toReleaseCoverArt(row: AssetRow, downloadUrl: string | null): ReleaseCoverArt {
  return {
    id: String(row.id || ''),
    releaseId: String(row.release_id || ''),
    fileName: String(row.file_name || ''),
    fileSize: Number(row.file_size) || 0,
    mimeType: row.mime_type ?? null,
    storagePath: String(row.storage_path || ''),
    uploadedAt: String(row.created_at || ''),
    downloadUrl,
  };
}

/**
 * The release's current cover art, resolved from `releases.artwork_asset_id`
 * — NOT the legacy `release_metadata.artwork_url` or the workspace-logo
 * fallback those other display paths fall back to. This scene manages the
 * ASSET; a release with only the legacy text URL (or nothing at all) reads
 * as "no cover art yet" here, which is honest — there's no asset row for the
 * scene to let the user replace or remove.
 */
export async function loadCurrentCoverArt(
  adminClient: AdminClient,
  releaseId: string
): Promise<{ error: string } | { coverArt: ReleaseCoverArt | null }> {
  const { data: release, error: releaseError } = await adminClient
    .from(RELEASES_TABLE)
    .select('artwork_asset_id')
    .eq('id', releaseId)
    .maybeSingle();

  if (releaseError) {
    return { error: releaseError.message || 'Could not load the release.' };
  }

  const assetId = release?.artwork_asset_id ? String(release.artwork_asset_id) : '';
  if (!assetId) {
    return { coverArt: null };
  }

  const { data: asset, error: assetError } = await adminClient
    .from(ASSETS_TABLE)
    .select(COVER_ART_COLUMNS)
    .eq('id', assetId)
    .maybeSingle();

  if (assetError) {
    return { error: assetError.message || 'Could not load the cover art.' };
  }
  // The pointer is stale (row deleted outside this flow, or never existed) —
  // degrade to "no cover art" rather than surfacing a 500 for it.
  if (!asset) {
    return { coverArt: null };
  }

  const row = asset as AssetRow;
  const downloadUrl = await generateSignedUrl(
    adminClient,
    row.storage_bucket || RELEASE_ASSETS_BUCKET,
    row.storage_path,
    ASSET_SIGNED_URL_TTL_SECONDS
  );

  return { coverArt: toReleaseCoverArt(row, downloadUrl) };
}

/** So call sites don't need to import the category constant from two places. */
export { COVER_ART_CATEGORY };
