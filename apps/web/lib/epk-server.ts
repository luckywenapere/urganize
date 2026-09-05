/**
 * Server-side assembly for the public EPK page (URG-196).
 *
 * The kit is never stored — every request assembles it live from the release
 * row, release_metadata, and the release's image assets, so the EPK stays in
 * sync with the release by construction. The share token (release_epks row)
 * is the only access control: the page runs with the service-role client and
 * an unresolvable token is a 404.
 *
 * Deliberately image-only on assets: cover art + promo images. Audio,
 * documents, and contracts are private working files and never surface on a
 * public link.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ASSET_SIGNED_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  generateSignedUrl,
} from '@/lib/asset-helpers';
import { loadCoverArtUrlMap } from '@/lib/cover-art';
import { loadWorkspaceLogoFallbackUrl } from '@/lib/workspace-logo';
import { successorPathForKit } from '@/lib/press-kit-public';

const RELEASE_EPKS_TABLE = 'release_epks';

export const isEpkFeatureEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_EPK === 'true';

export type PublicEpk = {
  artistName: string;
  title: string;
  releaseType: string;
  releaseDate: string | null;
  description: string | null;
  genre: string | null;
  subgenre: string | null;
  labelName: string | null;
  language: string | null;
  explicit: boolean | null;
  coverArtUrl: string | null;
  promoImageUrls: string[];
};

function createServiceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

/**
 * Where an old EPK link should send its reader, or null to render the EPK.
 *
 * The release-scoped EPK is retired in favour of the standing per-artist press
 * kit, but this page is the one surface a stranger may already hold a link to,
 * so nothing here breaks a link. The chain is token -> release -> artist ->
 * kit, and the answer is a path only when that kit is PUBLISHED.
 *
 * Never throws, and every uncertainty answers null. That direction is
 * deliberate: null means "render the EPK", which is what the reader had
 * yesterday, so a database blip costs nobody their page.
 */
export async function resolveEpkSuccessorPath(token: string): Promise<string | null> {
  if (!isEpkFeatureEnabled()) return null;
  const normalizedToken = token.trim();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(normalizedToken)) return null;

  const client = createServiceClient();
  if (!client) return null;

  try {
    const { data: epk } = await client
      .from(RELEASE_EPKS_TABLE)
      .select('release_id')
      .eq('share_token', normalizedToken)
      .maybeSingle();
    if (!epk?.release_id) return null;

    const { data: release } = await client
      .from('releases')
      .select('artist_id')
      .eq('id', String(epk.release_id))
      .maybeSingle();
    if (!release?.artist_id) return null;

    const { data: kit } = await client
      .from('press_kits')
      .select('slug,published_at')
      .eq('artist_id', String(release.artist_id))
      .maybeSingle();

    return successorPathForKit(
      kit ? { slug: String(kit.slug || ''), publishedAt: kit.published_at ? String(kit.published_at) : null } : null
    );
  } catch {
    return null;
  }
}

/**
 * Resolve a share token to the assembled kit. Returns null for anything that
 * should render as 404: flag off, unknown token, or a broken environment —
 * the public page never distinguishes "revoked" from "never existed".
 */
export async function loadPublicEpk(token: string): Promise<PublicEpk | null> {
  if (!isEpkFeatureEnabled()) return null;
  const normalizedToken = token.trim();
  // Tokens are 24-char base64url; a cheap shape check keeps junk paths from
  // reaching the database.
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(normalizedToken)) return null;

  const client = createServiceClient();
  if (!client) return null;

  try {
    const { data: epk, error: epkError } = await client
      .from(RELEASE_EPKS_TABLE)
      .select('release_id,owner_user_id')
      .eq('share_token', normalizedToken)
      .maybeSingle();

    if (epkError || !epk?.release_id) return null;

    const { data: release, error: releaseError } = await client
      .from('releases')
      .select(
        'id,owner_user_id,title,artist_name,release_type,release_date,description,artwork_asset_id'
      )
      .eq('id', String(epk.release_id))
      .maybeSingle();

    if (releaseError || !release) return null;

    const releaseId = String(release.id);

    const [coverMap, metadataResult, promoResult, workspaceLogoUrl] = await Promise.all([
      loadCoverArtUrlMap(client, [
        { id: releaseId, artwork_asset_id: release.artwork_asset_id ? String(release.artwork_asset_id) : null },
      ]),
      client
        .from('release_metadata')
        .select('genre,subgenre,label_name,language,explicit,artwork_url')
        .eq('release_id', releaseId)
        .maybeSingle(),
      client
        .from('assets')
        .select('storage_bucket,storage_path')
        .eq('release_id', releaseId)
        .eq('category', 'promo_image')
        .order('created_at', { ascending: false })
        .limit(8),
      loadWorkspaceLogoFallbackUrl(client, String(release.owner_user_id || '')),
    ]);

    const metadata = metadataResult.error ? null : metadataResult.data;

    // Same precedence as /api/releases' resolveCoverArtUrl: asset first,
    // legacy metadata URL second, workspace logo last.
    const coverArtUrl =
      coverMap.get(releaseId) ||
      (metadata?.artwork_url ? String(metadata.artwork_url) : null) ||
      workspaceLogoUrl ||
      null;

    const promoImageUrls: string[] = [];
    if (!promoResult.error && Array.isArray(promoResult.data)) {
      const signed = await Promise.all(
        promoResult.data.map((row) => {
          const asset = row as { storage_bucket?: string; storage_path?: string };
          if (!asset.storage_path) return Promise.resolve<string | null>(null);
          return generateSignedUrl(
            client,
            asset.storage_bucket || RELEASE_ASSETS_BUCKET,
            asset.storage_path,
            ASSET_SIGNED_URL_TTL_SECONDS
          );
        })
      );
      for (const url of signed) {
        if (url) promoImageUrls.push(url);
      }
    }

    return {
      artistName: String(release.artist_name || ''),
      title: String(release.title || ''),
      releaseType: String(release.release_type || 'single'),
      releaseDate: release.release_date ? String(release.release_date) : null,
      description: release.description ? String(release.description) : null,
      genre: metadata?.genre ? String(metadata.genre) : null,
      subgenre: metadata?.subgenre ? String(metadata.subgenre) : null,
      labelName: metadata?.label_name ? String(metadata.label_name) : null,
      language: metadata?.language ? String(metadata.language) : null,
      explicit: typeof metadata?.explicit === 'boolean' ? metadata.explicit : null,
      coverArtUrl,
      promoImageUrls,
    };
  } catch {
    // A public page must degrade to 404, never 500, on infrastructure blips.
    return null;
  }
}
