// Linking an artist to their streaming profile (Nov 2026, #1088). Server only.
//
// The person picks the artist once, on Deezer or Apple Music. This file checks
// that pick with the service itself (the browser only sends an id), saves it,
// and then links the same artist on the other services: Spotify by one of
// their songs' ISRC, Apple Music and Deezer by an exact name that also has a
// song we know is theirs. Anything it is not sure of stays unlinked.

import type { SupabaseClient } from '@supabase/supabase-js';
import { ARTISTS_TABLE } from '@/lib/artists-server';
import { isSafeSourceId, type ImportProvider } from '@/lib/artist-import/providers';
import { spotifyGet } from '@/lib/code-finder/sources';
import { lagosYmd } from '@/lib/altlink/rules';
import { pickSameArtist, shouldAskToLink, type StreamingLinkState } from './rules';

const TIMEOUT_MS = 6000;
const LINK_COLUMNS =
  'id,name,deezer_artist_id,apple_artist_id,spotify_artist_id,streaming_linked_at,streaming_link_skipped_at';

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
    if (!response.ok) return null;
    const body = (await response.json()) as unknown;
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type LinkRow = {
  id: string;
  name: string;
  deezer_artist_id: string | null;
  apple_artist_id: string | null;
  spotify_artist_id: string | null;
  streaming_linked_at: string | null;
  streaming_link_skipped_at: string | null;
};

const stateOf = (row: LinkRow): StreamingLinkState => ({
  deezerArtistId: row.deezer_artist_id,
  appleArtistId: row.apple_artist_id,
  spotifyArtistId: row.spotify_artist_id,
  linkedAt: row.streaming_linked_at,
  skippedAt: row.streaming_link_skipped_at,
});

/** The artist's name on the service, read by id. Null: no such artist, or unreachable. */
async function verifyArtist(provider: ImportProvider, id: string): Promise<string | null> {
  if (!isSafeSourceId(id)) return null;
  if (provider === 'deezer') {
    const body = await getJson(`https://api.deezer.com/artist/${id}`);
    return body && !body.error ? text(body.name) : null;
  }
  const body = await getJson(`https://itunes.apple.com/lookup?id=${id}`);
  const first = Array.isArray(body?.results) ? (body.results[0] as Record<string, unknown> | undefined) : undefined;
  return text(first?.artistName);
}

/** A Deezer artist's best known song: its title and ISRC. */
async function deezerTopSong(deezerId: string): Promise<{ title: string; isrc: string | null } | null> {
  const top = await getJson(`https://api.deezer.com/artist/${deezerId}/top?limit=1`);
  const first = Array.isArray(top?.data) ? (top.data[0] as Record<string, unknown> | undefined) : undefined;
  const title = text(first?.title);
  if (!title) return null;
  return { title, isrc: text(first?.isrc) };
}

/** The Spotify artist on a track with this ISRC whose name is ours. */
async function spotifyByIsrc(name: string, isrc: string): Promise<string | null> {
  const found = await spotifyGet(`/search?type=track&limit=5&q=${encodeURIComponent(`isrc:${isrc}`)}`);
  const items = (found?.tracks as Record<string, unknown> | undefined)?.items;
  const artists = (Array.isArray(items) ? items : []).flatMap((track) => {
    const list = (track as Record<string, unknown>).artists;
    return (Array.isArray(list) ? list : []).map((artist) => ({
      id: text((artist as Record<string, unknown>).id) ?? '',
      name: text((artist as Record<string, unknown>).name) ?? '',
    }));
  });
  const unique = Array.from(new Map(artists.filter((a) => a.id).map((a) => [a.id, a])).values());
  return pickSameArtist(name, unique, null);
}

/** The Apple Music artist with our exact name (and, if several, our song). */
async function appleByName(name: string, songTitle: string | null): Promise<string | null> {
  const found = await getJson(
    `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=musicArtist&limit=10`
  );
  const rows = (Array.isArray(found?.results) ? found.results : []) as Record<string, unknown>[];
  const candidates = rows
    .map((row) => ({ id: String(row.artistId ?? ''), name: text(row.artistName) ?? '' }))
    .filter((row) => /^[0-9]{1,40}$/.test(row.id));
  const sameName = candidates.filter((c) => c.name.toLowerCase() === name.toLowerCase());
  if (sameName.length > 1 && songTitle) {
    const withSongs = await Promise.all(
      sameName.map(async (candidate) => {
        const songs = await getJson(`https://itunes.apple.com/lookup?id=${candidate.id}&entity=song&limit=50`);
        const titles = (Array.isArray(songs?.results) ? songs.results : [])
          .map((row) => text((row as Record<string, unknown>).trackName))
          .filter((title): title is string => Boolean(title));
        return { ...candidate, songTitles: titles };
      })
    );
    return pickSameArtist(name, withSongs, songTitle);
  }
  return pickSameArtist(name, candidates, songTitle);
}

/** The Deezer artist with our exact name, when the person picked on Apple Music. */
async function deezerByName(name: string): Promise<string | null> {
  const found = await getJson(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=10`);
  const rows = (Array.isArray(found?.data) ? found.data : []) as Record<string, unknown>[];
  return pickSameArtist(
    name,
    rows.map((row) => ({ id: String(row.id ?? ''), name: text(row.name) ?? '' })).filter((row) => /^[0-9]+$/.test(row.id)),
    null
  );
}

async function loadRow(admin: SupabaseClient, workspaceId: string, artistId: string): Promise<LinkRow | null> {
  const { data, error } = await admin
    .from(ARTISTS_TABLE)
    .select(LINK_COLUMNS)
    .eq('workspace_id', workspaceId)
    .eq('id', artistId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LinkRow | null) ?? null;
}

export type LinkResult =
  | { ok: true; linked: { deezer: boolean; apple: boolean; spotify: boolean } }
  | { ok: false; status: 400 | 404 | 502; message: string };

/**
 * Saves the person's pick and links the other services. `artistId` must be on
 * the caller's team; `workspaceId` is the caller's, so another team's artist
 * reads as not found.
 */
export async function linkArtistStreaming(
  admin: SupabaseClient,
  input: { workspaceId: string; artistId: string; provider: ImportProvider; sourceId: string }
): Promise<LinkResult> {
  const row = await loadRow(admin, input.workspaceId, input.artistId);
  if (!row) return { ok: false, status: 404, message: 'That artist is not on your team.' };
  const theirName = await verifyArtist(input.provider, input.sourceId);
  if (!theirName) return { ok: false, status: 502, message: 'We could not find that artist on streaming. Try again.' };

  let deezer = input.provider === 'deezer' ? input.sourceId : null;
  let apple = input.provider === 'itunes' ? input.sourceId : null;
  let spotify: string | null = null;

  // The other services, best effort: none of this can fail the link.
  try {
    if (!deezer) deezer = await deezerByName(theirName);
    const top = deezer ? await deezerTopSong(deezer) : null;
    if (!apple) apple = await appleByName(theirName, top?.title ?? null);
    if (top?.isrc) spotify = await spotifyByIsrc(theirName, top.isrc);
  } catch (error) {
    console.warn('[artist-streaming] could not link the other services', error instanceof Error ? error.message : error);
  }

  const { error } = await admin
    .from(ARTISTS_TABLE)
    .update({
      deezer_artist_id: deezer,
      apple_artist_id: apple,
      spotify_artist_id: spotify,
      streaming_linked_at: new Date().toISOString(),
      streaming_link_skipped_at: null,
    })
    .eq('id', input.artistId)
    .eq('workspace_id', input.workspaceId);
  if (error) throw new Error(error.message);
  return { ok: true, linked: { deezer: Boolean(deezer), apple: Boolean(apple), spotify: Boolean(spotify) } };
}

/** "Not on streaming yet": stop asking until one of their rollouts comes out. */
export async function skipArtistStreaming(
  admin: SupabaseClient,
  input: { workspaceId: string; artistId: string }
): Promise<boolean> {
  const { data, error } = await admin
    .from(ARTISTS_TABLE)
    .update({ streaming_link_skipped_at: new Date().toISOString() })
    .eq('id', input.artistId)
    .eq('workspace_id', input.workspaceId)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export type ArtistToLink = { id: string; name: string };

/** The team's artists the Home popup should ask about, in roster order. */
export async function listArtistsToLink(
  admin: SupabaseClient,
  workspaceId: string,
  nowMs = Date.now()
): Promise<ArtistToLink[]> {
  const { data, error } = await admin
    .from(ARTISTS_TABLE)
    .select(LINK_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as LinkRow[];
  const skipped = rows.filter((row) => row.streaming_link_skipped_at);
  const datesByArtist = new Map<string, string[]>();
  if (skipped.length > 0) {
    const { data: releases } = await admin
      .from('releases')
      .select('artist_id,release_date')
      .in(
        'artist_id',
        skipped.map((row) => row.id)
      )
      .is('deleted_at', null);
    for (const release of (releases ?? []) as { artist_id: string; release_date: string | null }[]) {
      const list = datesByArtist.get(release.artist_id) ?? [];
      if (release.release_date) list.push(release.release_date);
      datesByArtist.set(release.artist_id, list);
    }
  }
  const today = lagosYmd(nowMs);
  return rows
    .filter((row) => shouldAskToLink(stateOf(row), datesByArtist.get(row.id) ?? [], today))
    .map((row) => ({ id: row.id, name: row.name }));
}

/** An artist's Deezer and Spotify ids, for finding their songs. */
export async function loadArtistStreamingIds(
  admin: SupabaseClient,
  artistId: string
): Promise<{ deezer: string | null; spotify: string | null }> {
  const { data } = await admin
    .from(ARTISTS_TABLE)
    .select('deezer_artist_id,spotify_artist_id')
    .eq('id', artistId)
    .maybeSingle();
  const row = (data ?? {}) as { deezer_artist_id?: string | null; spotify_artist_id?: string | null };
  return { deezer: row.deezer_artist_id ?? null, spotify: row.spotify_artist_id ?? null };
}

/** Old music brought in from a streaming profile also links the artist (#882). */
export async function linkAfterImport(
  admin: SupabaseClient,
  input: { workspaceId: string; artistId: string; provider: ImportProvider; sourceId: string }
): Promise<void> {
  try {
    const row = await loadRow(admin, input.workspaceId, input.artistId);
    if (!row || row.deezer_artist_id || row.apple_artist_id) return;
    await linkArtistStreaming(admin, input);
  } catch (error) {
    console.warn('[artist-streaming] link after import failed', error instanceof Error ? error.message : error);
  }
}
