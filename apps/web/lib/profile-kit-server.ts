import type { SupabaseClient } from '@supabase/supabase-js';
import { kitFactsFromPublished, pickArtistForMember, type KitFacts } from './profile-kit';
import { isPressKitsFeatureEnabled, loadPublicPressKit } from './press-kit-public-server';

/**
 * Finding the press kit that stands behind a directory profile.
 *
 * The link is the one the product already holds: a team member scoped to a
 * single artist IS that artist's own login (workspace_members.artist_scope_id).
 * There is no new column and nothing is migrated; see pickArtistForMember for
 * why a person with several artists, or none, is not matched.
 *
 * Both loaders NEVER THROW and answer "no kit" on any failure, because the
 * profile has its own fields to fall back to and a directory page that renders
 * without the kit's extras is better than one that errors. They read the
 * PUBLISHED kit only: loadPublicPressKit returns null for an unpublished kit,
 * and the batch read filters on published_at itself.
 */

const MEMBERS_TABLE = 'workspace_members';
const KITS_TABLE = 'press_kits';
const SECTIONS_TABLE = 'press_kit_sections';

const row = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** The artists each user is scoped to, grouped by user. */
async function artistScopesByUser(
  admin: SupabaseClient,
  userIds: readonly string[]
): Promise<Map<string, string[]>> {
  const scopes = new Map<string, string[]>();
  if (userIds.length === 0) return scopes;

  const { data, error } = await admin
    .from(MEMBERS_TABLE)
    .select('user_id, artist_scope_id')
    .in('user_id', [...userIds])
    .eq('status', 'active')
    .not('artist_scope_id', 'is', null);
  if (error || !data) return scopes;

  for (const entry of data) {
    const member = row(entry);
    const userId = str(member.user_id);
    const artistId = str(member.artist_scope_id);
    if (!userId || !artistId) continue;
    const held = scopes.get(userId) ?? [];
    held.push(artistId);
    scopes.set(userId, held);
  }
  return scopes;
}

/** The published kit facts for one person, or null when no kit stands behind them. */
export async function loadKitFactsForUser(
  admin: SupabaseClient,
  userId: string
): Promise<KitFacts | null> {
  if (!isPressKitsFeatureEnabled() || !userId) return null;

  try {
    const scopes = await artistScopesByUser(admin, [userId]);
    const artistId = pickArtistForMember(scopes.get(userId) ?? []);
    if (!artistId) return null;

    const { data, error } = await admin
      .from(KITS_TABLE)
      .select('slug, published_at')
      .eq('artist_id', artistId)
      .not('published_at', 'is', null)
      .maybeSingle();
    if (error || !data) return null;

    const slug = str(row(data).slug);
    if (!slug) return null;

    // The public loader is the one definition of "what a reader sees of a
    // published kit": hidden and empty sections already dropped, photos signed.
    const published = await loadPublicPressKit(slug);
    if (!published) return null;

    return kitFactsFromPublished(artistId, published);
  } catch {
    return null;
  }
}

/**
 * The published home city of every person in the list who has a kit, in three
 * queries however long the list is. The directory list shows a place on each
 * card and one query per person would be N+1 on the first paint.
 */
export async function loadKitCitiesForUsers(
  admin: SupabaseClient,
  userIds: readonly string[]
): Promise<Map<string, string>> {
  const cities = new Map<string, string>();
  if (!isPressKitsFeatureEnabled() || userIds.length === 0) return cities;

  try {
    const scopes = await artistScopesByUser(admin, userIds);

    const artistByUser = new Map<string, string>();
    for (const [userId, held] of scopes) {
      const artistId = pickArtistForMember(held);
      if (artistId) artistByUser.set(userId, artistId);
    }
    const artistIds = [...new Set(artistByUser.values())];
    if (artistIds.length === 0) return cities;

    const { data: kits } = await admin
      .from(KITS_TABLE)
      .select('id, artist_id')
      .in('artist_id', artistIds)
      .not('published_at', 'is', null);
    const kitByArtist = new Map<string, string>();
    for (const entry of kits || []) {
      const kit = row(entry);
      if (str(kit.id) && str(kit.artist_id)) kitByArtist.set(str(kit.artist_id), str(kit.id));
    }
    if (kitByArtist.size === 0) return cities;

    const { data: sections } = await admin
      .from(SECTIONS_TABLE)
      .select('kit_id, published_content')
      .eq('section', 'header')
      .eq('hidden', false)
      .in('kit_id', [...kitByArtist.values()]);
    const cityByKit = new Map<string, string>();
    for (const entry of sections || []) {
      const section = row(entry);
      const content = row(section.published_content);
      const city = str(content.homeCity);
      if (city) cityByKit.set(str(section.kit_id), city);
    }

    for (const [userId, artistId] of artistByUser) {
      const city = cityByKit.get(kitByArtist.get(artistId) ?? '');
      if (city) cities.set(userId, city);
    }
    return cities;
  } catch {
    return new Map();
  }
}
