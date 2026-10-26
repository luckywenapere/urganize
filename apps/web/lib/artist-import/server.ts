import type { SupabaseClient } from '@supabase/supabase-js';
import { checkArtistAllowance, createWorkspaceArtist, ARTISTS_TABLE } from '@/lib/artists-server';
import { normalizeReleaseSlug } from '@/lib/release-ops';
import { fetchImportReleases } from './fetch';
import type { ImportProvider, ImportRelease } from './providers';

export const CATALOGUE_TABLE = 'artist_catalogue_releases';

export type ImportOutcome =
  | { ok: true; artistId: string; artistName: string; added: number; total: number; createdArtist: boolean }
  | { ok: false; reason: 'source_unreachable' | 'artist_limit' | 'save_failed'; message: string };

/**
 * Puts one artist and their releases on a team. The server pulls the releases
 * itself from the source id, so the browser never sends a list of releases to
 * trust. Safe to run twice: rows are keyed on (artist, source, source id).
 *
 * Names the artist as typed on the team's roster when no artist of that name
 * is there yet; otherwise the releases join the artist already on the roster.
 */
export async function importArtistCatalogue(
  adminClient: SupabaseClient,
  input: { workspaceId: string; userId: string; provider: ImportProvider; sourceId: string; name: string }
): Promise<ImportOutcome> {
  const name = input.name.trim().slice(0, 120);
  const releases = await fetchImportReleases(input.provider, input.sourceId);
  if (releases === null) {
    return { ok: false, reason: 'source_unreachable', message: 'Could not reach the music service. Try again.' };
  }

  const slug = normalizeReleaseSlug(name);
  let artistId: string | null = null;
  let createdArtist = false;

  if (slug) {
    const existing = await adminClient
      .from(ARTISTS_TABLE)
      .select('id')
      .eq('workspace_id', input.workspaceId)
      .eq('slug', slug)
      .maybeSingle();
    if (existing.data) artistId = String((existing.data as { id: string }).id);
  }

  if (!artistId) {
    const allowance = await checkArtistAllowance(adminClient, input.workspaceId);
    if (!allowance.allowed) {
      return { ok: false, reason: 'artist_limit', message: 'Your plan has no room for another artist.' };
    }
    const created = await createWorkspaceArtist(adminClient, {
      workspaceId: input.workspaceId,
      ownerUserId: input.userId,
      name,
    });
    if (!created.data) {
      return { ok: false, reason: 'save_failed', message: created.error || 'Could not add the artist.' };
    }
    artistId = created.data.id;
    createdArtist = true;
  }

  const added = await saveCatalogueRows(adminClient, {
    workspaceId: input.workspaceId,
    artistId,
    userId: input.userId,
    releases,
  });
  if (added === null) {
    return { ok: false, reason: 'save_failed', message: 'Could not save the releases.' };
  }
  return { ok: true, artistId, artistName: name, added, total: releases.length, createdArtist };
}

/** Rows newly added (existing ones are refreshed, not counted), or null on a write error. */
async function saveCatalogueRows(
  adminClient: SupabaseClient,
  input: { workspaceId: string; artistId: string; userId: string; releases: readonly ImportRelease[] }
): Promise<number | null> {
  if (input.releases.length === 0) return 0;

  const before = await adminClient
    .from(CATALOGUE_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', input.artistId);

  const rows = input.releases.map((release) => ({
    workspace_id: input.workspaceId,
    artist_id: input.artistId,
    source: release.provider,
    source_id: release.sourceId,
    title: release.title.slice(0, 300),
    kind: release.kind,
    release_date: release.releaseDate,
    cover_url: release.coverUrl,
    url: release.url,
    created_by: input.userId,
  }));

  const { error } = await adminClient
    .from(CATALOGUE_TABLE)
    .upsert(rows, { onConflict: 'artist_id,source,source_id' });
  if (error) {
    console.error('[artist-import] could not save catalogue rows:', error.message);
    return null;
  }

  const after = await adminClient
    .from(CATALOGUE_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', input.artistId);
  return Math.max(0, (after.count ?? 0) - (before.count ?? 0));
}
