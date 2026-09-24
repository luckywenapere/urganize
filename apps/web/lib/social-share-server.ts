import type { SupabaseClient } from '@supabase/supabase-js';
import { RELEASE_ASSETS_BUCKET } from '@/lib/asset-helpers';
import { MAX_EMBEDDED_COVER_BYTES, isEmbeddableCoverArt } from '@/lib/social-share';

/**
 * The release's own cover art as a data: URL the poster renderer can draw, or
 * null to draw the typographic poster instead.
 *
 * Reads `releases.artwork_asset_id` ONLY, never the workspace-logo fallback
 * the release cards use. A card wants something in its artwork slot; a post
 * wants the fan to recognise the song, and a label logo does the opposite. The
 * capture page made the same call for the same reason.
 *
 * Never throws. Every failure (no asset, a format the renderer cannot decode,
 * a file over the cap, a storage hiccup) returns null, because the typographic
 * poster is a designed layout of its own: a missing cover must cost the image
 * its art, never the image.
 */
export async function loadShareCoverArtDataUrl(
  adminClient: SupabaseClient,
  artworkAssetId: string | null
): Promise<string | null> {
  if (!artworkAssetId) return null;

  try {
    const { data: asset, error } = await adminClient
      .from('assets')
      .select('storage_bucket,storage_path,mime_type,file_size')
      .eq('id', artworkAssetId)
      .maybeSingle();
    if (error || !asset) return null;

    const row = asset as {
      storage_bucket?: string | null;
      storage_path?: string | null;
      mime_type?: string | null;
      file_size?: number | null;
    };
    if (!row.storage_path) return null;
    if (!isEmbeddableCoverArt({ mimeType: row.mime_type, fileSize: row.file_size })) return null;

    const { data: blob, error: downloadError } = await adminClient.storage
      .from(row.storage_bucket || RELEASE_ASSETS_BUCKET)
      .download(row.storage_path);
    if (downloadError || !blob) return null;

    const bytes = Buffer.from(await blob.arrayBuffer());
    // The row's size can be 0 (the column's default) or simply wrong, so the
    // cap is enforced again on what actually came back.
    if (bytes.length === 0 || bytes.length > MAX_EMBEDDED_COVER_BYTES) return null;

    const mime = String(row.mime_type).toLowerCase() === 'image/png' ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${bytes.toString('base64')}`;
  } catch (error) {
    console.error('[share-card] could not load cover art, drawing the typographic poster', error);
    return null;
  }
}
