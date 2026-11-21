/**
 * Urganize music, the server half: reading songs for listeners and for the team
 * that owns them. Every function here takes a service-role client, because
 * music_tracks and music_plays have row level security on and no policies
 * (supabase/migrations/20261121100000_music_listening.sql): the ROUTE decides
 * who may see what, and the decisions themselves live in lib/music/rules.ts.
 *
 * Nothing here throws on a missing or unreadable table. A listener's page that
 * cannot load songs shows an empty list with a retry, never a stack trace.
 */

import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

import { ASSET_SIGNED_URL_TTL_SECONDS, RELEASE_ASSETS_BUCKET, generateSignedUrl } from '@/lib/asset-helpers';
import { loadCoverArtUrls } from '@/lib/cover-art';
import {
  artistsFromTracks,
  isTrackLive,
  matchesMusicQuery,
  shouldCountPlay,
  trackLiveAt,
  trackStatus,
  type ArtistHit,
  type MusicLiveMode,
  type TrackStatus,
  MUSIC_SAVED_LIMIT,
} from './rules';

export const MUSIC_TRACKS_TABLE = 'music_tracks';
export const MUSIC_PLAYS_TABLE = 'music_plays';

/** The most live songs one listing reads. The list is filtered and sorted in
 *  memory because "live" depends on each rollout's current release date, so a
 *  database page would split a day's songs across pages. Fine for the case we
 *  have; past this many songs the listing needs a stored go-live time. */
export const MUSIC_LIVE_READ_LIMIT = 500;

/** How many songs one page of the listing returns. */
export const MUSIC_PAGE_SIZE = 40;

/** A short link to the audio. Long enough to finish a song and its next one. */
export const MUSIC_STREAM_TTL_SECONDS = 60 * 60;

export type PublicTrack = {
  id: string;
  title: string;
  artistName: string;
  explicit: boolean;
  durationSeconds: number | null;
  /** When it went (or goes) live, ISO. */
  liveAt: string;
  coverUrl: string | null;
  /** Same-origin path; redirects to a short signed link. */
  streamUrl: string;
};

export type OwnerTrack = {
  id: string;
  releaseId: string;
  title: string;
  artistName: string;
  explicit: boolean;
  liveMode: MusicLiveMode;
  fileName: string;
  fileBytes: number;
  durationSeconds: number | null;
  rightsConfirmed: boolean;
  publishedAt: string | null;
  takenDownAt: string | null;
  createdAt: string;
  status: TrackStatus;
  /** ISO of the moment it is or was due to go live, or null (draft, or release
   *  day with no date set). */
  liveAt: string | null;
  plays: number;
  /** A short link so the team can hear the file they uploaded. */
  previewUrl: string | null;
};

/** A service client for the public routes, which have no signed-in user to
 *  borrow a URL from. Null when the server is not configured. */
export function createMusicServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * The signed-in user's id if the request carries a valid token, else null.
 * Listening needs no account, so a missing or bad token is never an error.
 */
export async function optionalUserId(request: NextRequest): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!url || !anon || !token) return null;
  try {
    const { data, error } = await createClient(url, anon).auth.getUser(token);
    return error || !data.user?.id ? null : data.user.id;
  } catch {
    return null;
  }
}

type ReleaseEmbed = {
  release_date: string | null;
  deleted_at: string | null;
  artwork_asset_id: string | null;
};

type LiveRow = {
  id: string;
  release_id: string;
  title: string;
  artist_name: string;
  explicit: boolean;
  live_mode: MusicLiveMode;
  duration_seconds: number | null;
  published_at: string | null;
  taken_down_at: string | null;
  releases: ReleaseEmbed | ReleaseEmbed[] | null;
};

const oneRelease = (embed: ReleaseEmbed | ReleaseEmbed[] | null): ReleaseEmbed | null =>
  Array.isArray(embed) ? (embed[0] ?? null) : embed;

const LIVE_COLUMNS =
  'id,release_id,title,artist_name,explicit,live_mode,duration_seconds,published_at,taken_down_at,' +
  'releases!inner(release_date,deleted_at,artwork_asset_id)';

/**
 * Every song a listener may hear right now, newest first, optionally narrowed
 * by a search. `total` is the size of the whole filtered set, so a screen can
 * say "12 songs" and know whether another page exists.
 */
export async function loadLiveTracks(
  adminClient: SupabaseClient,
  options: { query?: string; ids?: string[]; offset?: number; limit?: number; nowMs?: number } = {}
): Promise<{ tracks: PublicTrack[]; artists: ArtistHit[]; total: number; failed: boolean }> {
  const nowMs = options.nowMs ?? Date.now();
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const idSet = options.ids ? new Set(options.ids) : null;
  // Asking for songs by id (a listener's saved ones) may take more than one page.
  const cap = idSet ? MUSIC_SAVED_LIMIT : MUSIC_PAGE_SIZE;
  const limit = Math.min(cap, Math.max(1, Math.floor(options.limit ?? MUSIC_PAGE_SIZE)));

  const { data, error } = await adminClient
    .from(MUSIC_TRACKS_TABLE)
    .select(LIVE_COLUMNS)
    .not('published_at', 'is', null)
    .is('taken_down_at', null)
    .order('published_at', { ascending: false })
    .limit(MUSIC_LIVE_READ_LIMIT);

  if (error || !Array.isArray(data)) {
    return { tracks: [], artists: [], total: 0, failed: true };
  }

  const live = (data as unknown as LiveRow[])
    .map((row) => {
      const release = oneRelease(row.releases);
      if (!release) return null;
      const input = {
        liveMode: row.live_mode,
        publishedAt: row.published_at,
        takenDownAt: row.taken_down_at,
      };
      const releaseInput = { releaseDate: release.release_date, deletedAt: release.deleted_at };
      if (!isTrackLive(input, releaseInput, nowMs)) return null;
      return { row, release, liveAtMs: trackLiveAt(input, releaseInput) as number };
    })
    .filter((entry): entry is { row: LiveRow; release: ReleaseEmbed; liveAtMs: number } => entry !== null)
    .filter((entry) => !idSet || idSet.has(entry.row.id))
    .filter((entry) =>
      matchesMusicQuery({ title: entry.row.title, artistName: entry.row.artist_name }, options.query ?? '')
    )
    .sort((a, b) => b.liveAtMs - a.liveAtMs || a.row.title.localeCompare(b.row.title));

  const artists = artistsFromTracks(live.map((entry) => ({ artistName: entry.row.artist_name })));
  const page = live.slice(offset, offset + limit);

  const covers = await loadCoverArtUrls(
    adminClient,
    page.map((entry) => ({ id: entry.row.release_id, artwork_asset_id: entry.release.artwork_asset_id }))
  ).catch(() => new Map());

  const tracks: PublicTrack[] = page.map((entry) => {
    const cover = covers.get(entry.row.release_id);
    return {
      id: entry.row.id,
      title: entry.row.title,
      artistName: entry.row.artist_name,
      explicit: entry.row.explicit,
      durationSeconds: entry.row.duration_seconds,
      liveAt: new Date(entry.liveAtMs).toISOString(),
      coverUrl: cover ? (cover.thumbUrl ?? cover.url) : null,
      streamUrl: `/api/music/tracks/${entry.row.id}/stream`,
    };
  });

  return { tracks, artists, total: live.length, failed: false };
}

/** The storage location of a song, only if it may be heard right now. */
export async function loadStreamableTrack(
  adminClient: SupabaseClient,
  trackId: string,
  nowMs: number = Date.now()
): Promise<{ bucket: string; path: string } | null> {
  const { data, error } = await adminClient
    .from(MUSIC_TRACKS_TABLE)
    .select(
      'audio_bucket,audio_path,live_mode,published_at,taken_down_at,releases!inner(release_date,deleted_at)'
    )
    .eq('id', trackId)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as unknown as {
    audio_bucket: string | null;
    audio_path: string;
    live_mode: MusicLiveMode;
    published_at: string | null;
    taken_down_at: string | null;
    releases: { release_date: string | null; deleted_at: string | null } | { release_date: string | null; deleted_at: string | null }[] | null;
  };
  const release = Array.isArray(row.releases) ? row.releases[0] : row.releases;
  if (!release) return null;
  const live = isTrackLive(
    { liveMode: row.live_mode, publishedAt: row.published_at, takenDownAt: row.taken_down_at },
    { releaseDate: release.release_date, deletedAt: release.deleted_at },
    nowMs
  );
  return live ? { bucket: row.audio_bucket || RELEASE_ASSETS_BUCKET, path: row.audio_path } : null;
}

/** A listener key nobody can read a person out of: a hash of the signed-in id,
 *  or of the random id the browser keeps. Salted with the track so one person's
 *  key differs from song to song. */
export function listenerKeyFor(trackId: string, userId: string | null, anonId: string | null): string | null {
  const source = userId ? `u:${userId}` : anonId ? `a:${anonId}` : null;
  if (!source) return null;
  return createHash('sha256').update(`${trackId}|${source}`).digest('hex').slice(0, 40);
}

/** Write one play, unless this listener already added one inside the window.
 *  Never throws: a play that cannot be written is not worth failing a page for. */
export async function recordPlay(
  adminClient: SupabaseClient,
  params: { trackId: string; userId: string | null; anonId: string | null; nowMs?: number }
): Promise<'counted' | 'repeat' | 'skipped'> {
  const nowMs = params.nowMs ?? Date.now();
  const key = listenerKeyFor(params.trackId, params.userId, params.anonId);
  if (!key) return 'skipped';

  try {
    const { data: last } = await adminClient
      .from(MUSIC_PLAYS_TABLE)
      .select('played_at')
      .eq('track_id', params.trackId)
      .eq('listener_key', key)
      .order('played_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastMs = last?.played_at ? Date.parse(String(last.played_at)) : null;
    if (!shouldCountPlay(Number.isFinite(lastMs) ? lastMs : null, nowMs)) return 'repeat';

    const { error } = await adminClient.from(MUSIC_PLAYS_TABLE).insert({
      track_id: params.trackId,
      listener_user_id: params.userId,
      listener_key: key,
      played_at: new Date(nowMs).toISOString(),
    });
    return error ? 'skipped' : 'counted';
  } catch {
    return 'skipped';
  }
}

type OwnerRow = {
  id: string;
  release_id: string;
  title: string;
  artist_name: string;
  explicit: boolean;
  live_mode: MusicLiveMode;
  file_name: string;
  audio_bytes: number | string;
  audio_bucket: string | null;
  audio_path: string;
  duration_seconds: number | null;
  rights_confirmed_at: string | null;
  published_at: string | null;
  taken_down_at: string | null;
  created_at: string;
};

export const OWNER_TRACK_COLUMNS =
  'id,release_id,title,artist_name,explicit,live_mode,file_name,audio_bytes,audio_bucket,audio_path,' +
  'duration_seconds,rights_confirmed_at,published_at,taken_down_at,created_at';

/** Play counts for a set of songs, in one query. A song with none reads 0. */
export async function loadPlayCounts(
  adminClient: SupabaseClient,
  trackIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>(trackIds.map((id) => [id, 0]));
  if (trackIds.length === 0) return counts;
  const results = await Promise.all(
    trackIds.map(async (id) => {
      const { count } = await adminClient
        .from(MUSIC_PLAYS_TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('track_id', id);
      return [id, count ?? 0] as const;
    })
  );
  for (const [id, count] of results) counts.set(id, count);
  return counts;
}

export async function toOwnerTracks(
  adminClient: SupabaseClient,
  rows: OwnerRow[],
  release: { releaseDate: string | null; deletedAt: string | null },
  nowMs: number = Date.now()
): Promise<OwnerTrack[]> {
  const plays = await loadPlayCounts(
    adminClient,
    rows.map((row) => row.id)
  );
  return Promise.all(
    rows.map(async (row) => {
      const input = {
        liveMode: row.live_mode,
        publishedAt: row.published_at,
        takenDownAt: row.taken_down_at,
      };
      const at = trackLiveAt(input, release);
      return {
        id: row.id,
        releaseId: row.release_id,
        title: row.title,
        artistName: row.artist_name,
        explicit: row.explicit,
        liveMode: row.live_mode,
        fileName: row.file_name,
        fileBytes: Number(row.audio_bytes) || 0,
        durationSeconds: row.duration_seconds,
        rightsConfirmed: Boolean(row.rights_confirmed_at),
        publishedAt: row.published_at,
        takenDownAt: row.taken_down_at,
        createdAt: row.created_at,
        status: trackStatus(input, release, nowMs),
        liveAt: at === null ? null : new Date(at).toISOString(),
        plays: plays.get(row.id) ?? 0,
        previewUrl: await generateSignedUrl(
          adminClient,
          row.audio_bucket || RELEASE_ASSETS_BUCKET,
          row.audio_path,
          ASSET_SIGNED_URL_TTL_SECONDS
        ),
      };
    })
  );
}

export async function loadOwnerTracks(
  adminClient: SupabaseClient,
  releaseId: string,
  release: { releaseDate: string | null; deletedAt: string | null }
): Promise<OwnerTrack[] | null> {
  const { data, error } = await adminClient
    .from(MUSIC_TRACKS_TABLE)
    .select(OWNER_TRACK_COLUMNS)
    .eq('release_id', releaseId)
    .order('created_at', { ascending: false });
  if (error || !Array.isArray(data)) return null;
  return toOwnerTracks(adminClient, data as unknown as OwnerRow[], release);
}

export type { OwnerRow };
