import type { SupabaseClient } from '@supabase/supabase-js';
import { checkArtistAllowance, createWorkspaceArtist, ARTISTS_TABLE } from '@/lib/artists-server';
import { normalizeReleaseSlug } from '@/lib/release-ops';
import { fetchImportArtistPhotoUrl, fetchImportReleases } from './fetch';
import { RELEASE_ASSETS_BUCKET } from '@/lib/asset-constants';
import { artistPhotoPathPrefix, isProfilePhotoMimeType, MAX_PROFILE_PHOTO_BYTES } from '@/lib/profile-photo';
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
 * `artistId` (a roster artist the person chose, #865) puts the releases on
 * that artist instead, so "Babyboy Dorian" can land on "Dorian".
 */
export async function importArtistCatalogue(
  adminClient: SupabaseClient,
  input: {
    workspaceId: string;
    userId: string;
    provider: ImportProvider;
    sourceId: string;
    name: string;
    artistId?: string;
    /** Check this profile for new drops from now on (#882). Default on. */
    sync?: boolean;
  }
): Promise<ImportOutcome> {
  const name = input.name.trim().slice(0, 120);
  const releases = await fetchImportReleases(input.provider, input.sourceId);
  if (releases === null) {
    return { ok: false, reason: 'source_unreachable', message: 'Could not reach the music service. Try again.' };
  }

  const slug = normalizeReleaseSlug(name);
  let artistId: string | null = null;
  let artistName = name;
  let createdArtist = false;

  if (input.artistId) {
    const chosen = await adminClient
      .from(ARTISTS_TABLE)
      .select('id,name')
      .eq('workspace_id', input.workspaceId)
      .eq('id', input.artistId)
      .maybeSingle();
    if (!chosen.data) {
      return { ok: false, reason: 'save_failed', message: 'That artist is not on your roster.' };
    }
    artistId = String((chosen.data as { id: string }).id);
    artistName = String((chosen.data as { name: string }).name || name);
  }

  if (!artistId && slug) {
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
      createdVia: 'import',
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
  await rememberStreamingProfile(adminClient, {
    artistId,
    provider: input.provider,
    sourceId: input.sourceId,
    sync: input.sync !== false,
  });
  return { ok: true, artistId, artistName, added, total: releases.length, createdArtist };
}

/**
 * The artist remembers the profile their music came from, so new drops can be
 * checked for later, and takes its photo when they have none yet (#882). The
 * photo is copied into our bucket like an uploaded one; a failure leaves the
 * initials tile and never fails the import.
 */
async function rememberStreamingProfile(
  adminClient: SupabaseClient,
  input: { artistId: string; provider: ImportProvider; sourceId: string; sync: boolean }
): Promise<void> {
  const { error } = await adminClient
    .from(ARTISTS_TABLE)
    .update({
      streaming_source: input.provider,
      streaming_source_id: input.sourceId,
      catalogue_sync: input.sync,
      catalogue_synced_at: new Date().toISOString(),
    })
    .eq('id', input.artistId);
  if (error) console.error('[artist-import] could not remember the profile:', error.message);

  const current = await adminClient.from(ARTISTS_TABLE).select('photo_path').eq('id', input.artistId).maybeSingle();
  if ((current.data as { photo_path?: string | null } | null)?.photo_path) return;
  try {
    const url = await fetchImportArtistPhotoUrl(input.provider, input.sourceId);
    if (!url) return;
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!response.ok || !isProfilePhotoMimeType(type)) return;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_PROFILE_PHOTO_BYTES) return;
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${artistPhotoPathPrefix(input.artistId)}streaming-${Date.now()}.${ext}`;
    const upload = await adminClient.storage.from(RELEASE_ASSETS_BUCKET).upload(path, bytes, { contentType: type });
    if (upload.error) return;
    await adminClient.from(ARTISTS_TABLE).update({ photo_path: path }).eq('id', input.artistId).is('photo_path', null);
  } catch (error) {
    console.warn('[artist-import] no photo copied:', error instanceof Error ? error.message : error);
  }
}

/** How long a checked profile waits before it is checked for new drops again. */
export const CATALOGUE_SYNC_EVERY_MS = 20 * 60 * 60 * 1000;

export type StreamingProfile = {
  source: ImportProvider;
  sync: boolean;
  syncedAt: string | null;
};

/** Pure: whether a profile is due a check for new drops. */
export function isCatalogueSyncDue(profile: StreamingProfile | null, now: Date = new Date()): boolean {
  if (!profile || !profile.sync) return false;
  if (!profile.syncedAt) return true;
  const last = Date.parse(profile.syncedAt);
  return !Number.isFinite(last) || now.getTime() - last >= CATALOGUE_SYNC_EVERY_MS;
}

/**
 * Checks a remembered profile for new drops and saves them (#882). The row is
 * claimed first by moving its stamp, so two people opening the artist at once
 * make one call to the music service. Runs after the reply; never throws.
 */
export async function syncArtistCatalogue(adminClient: SupabaseClient, artistId: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - CATALOGUE_SYNC_EVERY_MS).toISOString();
    const claimed = await adminClient
      .from(ARTISTS_TABLE)
      .update({ catalogue_synced_at: new Date().toISOString() })
      .eq('id', artistId)
      .eq('catalogue_sync', true)
      .not('streaming_source_id', 'is', null)
      .or(`catalogue_synced_at.is.null,catalogue_synced_at.lt.${cutoff}`)
      .select('id,workspace_id,owner_user_id,streaming_source,streaming_source_id')
      .maybeSingle();
    const row = claimed.data as {
      workspace_id: string;
      owner_user_id: string;
      streaming_source: ImportProvider;
      streaming_source_id: string;
    } | null;
    if (!row) return;
    const releases = await fetchImportReleases(row.streaming_source, row.streaming_source_id);
    if (releases === null) {
      // Unreachable: let the next visit try again.
      await adminClient.from(ARTISTS_TABLE).update({ catalogue_synced_at: null }).eq('id', artistId);
      return;
    }
    await saveCatalogueRows(adminClient, {
      workspaceId: row.workspace_id,
      artistId,
      userId: row.owner_user_id,
      releases,
    });
  } catch (error) {
    console.warn('[artist-import] sync failed:', error instanceof Error ? error.message : error);
  }
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

  // Apple gives no UPC or ISRC, so there is nothing to look up for those rows.
  // Stamped separately: a bulk upsert would reset the stamp on the others.
  await adminClient
    .from(CATALOGUE_TABLE)
    .update({ codes_checked_at: new Date().toISOString() })
    .eq('artist_id', input.artistId)
    .eq('source', 'itunes')
    .is('codes_checked_at', null);

  const after = await adminClient
    .from(CATALOGUE_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', input.artistId);
  return Math.max(0, (after.count ?? 0) - (before.count ?? 0));
}
