/**
 * Server-side assembly for a curator's public page at /pitch/{slug}.
 *
 * Shaped after lib/press-kit-public-server.ts, which is this codebase's pattern
 * for a public page assembled from more than one table: one service-role
 * client, per source tolerance, and ONE answer for every failure. A flag that
 * is off, a slug nobody ever had, a page that was never published and a
 * database that is down all return null, so a reader cannot tell which they
 * hit. That is deliberate — a page saying "this curator exists but is not
 * published" tells a stranger something she chose not to.
 *
 * Never throws.
 *
 * The service-role client can read every column of every curator, so the
 * payload builder in lib/curator-public.ts is the entire privacy boundary. Read
 * its header before changing anything here.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ASSET_SIGNED_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  generateSignedUrl,
} from '@/lib/asset-helpers';
import {
  buildPublicCuratorPayload,
  CURATOR_SLUG_SHAPE,
  isCuratorPageLive,
  MAX_CURATOR_SLUG_LENGTH,
  type PublicCuratorPage,
} from '@/lib/curator-public';

/**
 * Both flags, and the second one is not belt and braces.
 *
 * NEXT_PUBLIC_FEATURE_PITCHING turns the whole curator side dark — every
 * /api/curator route 404s and CuratorShell bounces her out. A public page
 * advertising playlists she cannot log in to manage would outlive the feature
 * it belongs to.
 */
export const isCuratorPageFeatureEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_CURATOR_PAGE === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';

function createServiceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

const asRow = (value: unknown): Record<string, unknown> =>
  (value || {}) as Record<string, unknown>;

/**
 * Resolve a slug to the page a stranger sees, or null.
 *
 * The photo is signed here rather than stored, because a signed URL expires and
 * a cached one starts returning 403 mid-session. It uses generateSignedUrl
 * rather than the raw storage call the curator's own profile route makes: that
 * one throws nothing but returns no null-safety either, and here a photo that
 * will not sign should cost the photo rather than the page.
 */
export async function loadPublicCuratorPage(slug: string): Promise<PublicCuratorPage | null> {
  if (!isCuratorPageFeatureEnabled()) return null;

  const normalized = String(slug || '').trim().toLowerCase();
  if (
    !normalized ||
    normalized.length > MAX_CURATOR_SLUG_LENGTH ||
    !CURATOR_SLUG_SHAPE.test(normalized)
  ) {
    return null;
  }

  const client = createServiceClient();
  if (!client) return null;

  try {
    const { data: profileData, error: profileError } = await client
      .from('curator_profiles')
      // user_id and photo_path are read because the playlists are found by the
      // first and the photo is signed from the second. Neither reaches the
      // payload; see buildPublicCuratorPayload.
      .select('user_id,display_name,bio,photo_path,slug,published_at')
      .eq('slug', normalized)
      .maybeSingle();

    if (profileError) return null;
    const profile = asRow(profileData);
    if (!profile.user_id) return null;
    if (!isCuratorPageLive(profile.published_at ? String(profile.published_at) : null)) {
      return null;
    }

    // Her playlists, biggest first, the same order the in-app browse list uses
    // so the two surfaces do not rank her own playlists differently.
    const { data: playlistData, error: playlistError } = await client
      .from('curator_playlists')
      .select('id,name,platform,genres,follower_count,url')
      .eq('curator_user_id', String(profile.user_id))
      .order('follower_count', { ascending: false, nullsFirst: false });

    // A failed playlist read degrades to a page with none rather than a 404:
    // her name, her bio and the way in are still worth showing.
    const playlists = playlistError ? [] : (playlistData || []).map(asRow);

    const photoPath = typeof profile.photo_path === 'string' ? profile.photo_path : '';
    const photoUrl = photoPath
      ? await generateSignedUrl(
          client,
          RELEASE_ASSETS_BUCKET,
          photoPath,
          ASSET_SIGNED_URL_TTL_SECONDS
        )
      : null;

    return buildPublicCuratorPayload(profile, playlists, photoUrl);
  } catch {
    return null;
  }
}
