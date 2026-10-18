import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ASSET_SIGNED_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  generateSignedUrl,
  generateThumbSignedUrls,
} from '@/lib/asset-helpers';

export type ReleaseCoverInput = { id: string; artwork_asset_id: string | null };

/**
 * Resolve cover-art signed URLs for a batch of releases from
 * `releases.artwork_asset_id` (the Phase 3 source of truth). Looks up each
 * referenced asset, then mints a fresh signed download URL (the bucket is
 * private). Returns a Map keyed by release id. Releases without an
 * artwork_asset_id, or whose asset/signed-URL lookup fails, are simply absent
 * from the map — callers degrade to `null` (or, in /api/releases, to the
 * legacy `release_metadata.artwork_url` fallback).
 *
 * Extracted from /api/releases/route.ts so /api/command-center
 * (via ReleaseService.getReleasesForUser) can reuse the exact same
 * resolution path without duplicating the asset / signed-URL logic.
 */
export async function loadCoverArtUrlMap(
  adminClient: SupabaseClient,
  releases: ReleaseCoverInput[]
): Promise<Map<string, string>> {
  const covers = await loadCoverArtUrls(adminClient, releases, { thumbs: false });
  const coverByReleaseId = new Map<string, string>();
  covers.forEach((cover, releaseId) => coverByReleaseId.set(releaseId, cover.url));
  return coverByReleaseId;
}

export type ResolvedCoverArt = {
  /** The full upload: for the cover-art view and anything shown large. */
  url: string;
  /** The 384px copy (lib/image-thumb.ts) for lists, pickers and tiles; null
   *  for an upload that has none yet, so callers fall back to `url`. */
  thumbUrl: string | null;
};

/**
 * `loadCoverArtUrlMap` plus each cover's small display copy (2026-10-18:
 * a 2.9 MB PNG was painting a 40px rollout row). Thumbs are signed in one
 * batched call next to the originals.
 */
export async function loadCoverArtUrls(
  adminClient: SupabaseClient,
  releases: ReleaseCoverInput[],
  options: { thumbs?: boolean } = {}
): Promise<Map<string, ResolvedCoverArt>> {
  const wantThumbs = options.thumbs !== false;
  const coverByReleaseId = new Map<string, ResolvedCoverArt>();

  const withArtwork = releases.filter((r) => r.artwork_asset_id);
  const assetIds = Array.from(new Set(withArtwork.map((r) => r.artwork_asset_id as string)));
  if (assetIds.length === 0) {
    return coverByReleaseId;
  }

  const { data, error } = await adminClient
    .from('assets')
    .select('id,storage_bucket,storage_path')
    .in('id', assetIds);

  if (error || !Array.isArray(data)) {
    // Non-fatal: degrade to whatever the caller wants (null or legacy fallback).
    return coverByReleaseId;
  }

  const assetById = new Map<string, { bucket: string; path: string }>();
  for (const row of data) {
    const asset = row as { id?: string; storage_bucket?: string; storage_path?: string };
    if (asset.id && asset.storage_path) {
      assetById.set(asset.id, {
        bucket: asset.storage_bucket || RELEASE_ASSETS_BUCKET,
        path: asset.storage_path,
      });
    }
  }

  // Thumbs, one batched call per bucket (in practice just release-assets).
  const thumbsByBucket = new Map<string, Map<string, string>>();
  if (wantThumbs) {
    const pathsByBucket = new Map<string, string[]>();
    assetById.forEach(({ bucket, path }) => {
      const list = pathsByBucket.get(bucket) ?? [];
      list.push(path);
      pathsByBucket.set(bucket, list);
    });
    await Promise.all(
      Array.from(pathsByBucket.entries()).map(async ([bucket, paths]) => {
        thumbsByBucket.set(
          bucket,
          await generateThumbSignedUrls(adminClient, bucket, paths, ASSET_SIGNED_URL_TTL_SECONDS)
        );
      })
    );
  }

  await Promise.all(
    withArtwork.map(async (release) => {
      const asset = assetById.get(release.artwork_asset_id as string);
      if (!asset) return;
      const signedUrl = await generateSignedUrl(
        adminClient,
        asset.bucket,
        asset.path,
        ASSET_SIGNED_URL_TTL_SECONDS
      );
      if (signedUrl) {
        coverByReleaseId.set(release.id, {
          url: signedUrl,
          thumbUrl: thumbsByBucket.get(asset.bucket)?.get(asset.path) ?? null,
        });
      }
    })
  );

  return coverByReleaseId;
}
