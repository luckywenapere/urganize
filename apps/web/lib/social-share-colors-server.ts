import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isBrandColorsEnabled,
  normalizeHexColor,
  type BrandColors,
} from '@/lib/social-share-colors';

// Reads and writes the two brand color columns on `artists`
// (20260924120000_artists_brand_colors.sql).
//
// THE READS NEVER THROW AND NEVER FAIL AN IMAGE. They run on the path that
// draws a share poster, and a color is decoration: a missing column (the
// migration not applied yet), a network blip or a bad row all answer "no brand
// colors", and the poster is drawn in Urganize's colors instead. The flag is
// checked here as well as at every caller, so a stale caller cannot read
// columns that are not there.
//
// The columns are read in their OWN query rather than added to
// listWorkspaceArtists' select. Adding them there would make the whole roster
// fail to load wherever the migration has not run, taking Settings and the
// create-release picker down with it for the sake of two colors.

const ARTISTS = 'artists';

type BrandRow = {
  id?: unknown;
  brand_background?: unknown;
  brand_accent?: unknown;
};

function toBrandColors(row: BrandRow): BrandColors {
  return {
    background: normalizeHexColor(row.brand_background),
    accent: normalizeHexColor(row.brand_accent),
  };
}

/** Brand colors for several artists at once, keyed by artist id. */
export async function loadArtistBrandColors(
  adminClient: SupabaseClient,
  artistIds: string[]
): Promise<Map<string, BrandColors>> {
  const result = new Map<string, BrandColors>();
  const ids = [...new Set(artistIds.filter(Boolean))];
  if (!isBrandColorsEnabled() || ids.length === 0) return result;

  try {
    const { data, error } = await adminClient
      .from(ARTISTS)
      .select('id, brand_background, brand_accent')
      .in('id', ids);
    if (error) {
      console.warn('[brand-colors] could not read artist colors, using the defaults', error.message);
      return result;
    }
    for (const row of (data ?? []) as BrandRow[]) {
      if (typeof row.id === 'string') result.set(row.id, toBrandColors(row));
    }
  } catch (error) {
    console.warn('[brand-colors] could not read artist colors, using the defaults', error);
  }
  return result;
}

/** One artist's brand colors, or null for "draw it in Urganize's colors". */
export async function loadArtistBrandColorsFor(
  adminClient: SupabaseClient,
  artistId: string | null | undefined
): Promise<BrandColors | null> {
  if (!artistId) return null;
  const colors = await loadArtistBrandColors(adminClient, [artistId]);
  return colors.get(artistId) ?? null;
}

/**
 * Save both slots at once. The caller has already normalized the colors and
 * checked the artist is on the caller's roster; this only writes. Unlike the
 * reads it DOES report failure, because a save that silently did nothing is
 * the "did it save?" moment this product promises not to have.
 */
export async function saveArtistBrandColors(
  adminClient: SupabaseClient,
  artistId: string,
  colors: BrandColors
): Promise<{ ok: true; value: BrandColors } | { ok: false }> {
  const value: BrandColors = {
    background: normalizeHexColor(colors.background),
    accent: normalizeHexColor(colors.accent),
  };
  try {
    const { data, error } = await adminClient
      .from(ARTISTS)
      .update({
        brand_background: value.background,
        brand_accent: value.accent,
        updated_at: new Date().toISOString(),
      })
      .eq('id', artistId)
      .select('id, brand_background, brand_accent')
      .maybeSingle();
    if (error || !data) {
      console.error('[brand-colors] could not save artist colors', error?.message ?? 'no row updated');
      return { ok: false };
    }
    return { ok: true, value: toBrandColors(data as BrandRow) };
  } catch (error) {
    console.error('[brand-colors] could not save artist colors', error);
    return { ok: false };
  }
}
