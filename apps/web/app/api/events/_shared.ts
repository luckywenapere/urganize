import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { listWorkspaceArtists, type WorkspaceArtist } from '@/lib/artists-server';
import { decideReleaseAccess } from '@/lib/release-access';
import { buildReadOnlyResponse, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import type { EventStatus } from '@/lib/events';
import type { RunOfShowItem, ShowEvent } from '@/types/events';

// Shared helpers for the events route group: table constants, the feature
// flag, row mappers and the access wrapper.
//
// No schema-missing fallback here on purpose: environments are assumed
// migrated (CLAUDE.md, "Patterns being deprecated in v1"), and a missing table
// surfaces as an ordinary 500. This module must never import
// app/api/releases/_shared.ts, which still carries those deprecated helpers —
// lib/schema-fallback-guard.test.ts fails the build for a new file that does.

export {
  getAuthenticatedUser,
  requireActiveAuthenticatedUser,
  requireAuthenticatedAdmin,
  createAdminClient,
} from '@/app/api/_shared/auth';

export const EVENTS_TABLE = 'events';
export const RUN_OF_SHOW_TABLE = 'event_run_of_show';
export const SETLISTS_TABLE = 'setlists';
export const SETLIST_ITEMS_TABLE = 'setlist_items';
export const SONGS_TABLE = 'songs';
export const SONG_VERSIONS_TABLE = 'song_versions';
export const DJ_PACKS_TABLE = 'dj_packs';
export const DJ_PACK_RECIPIENTS_TABLE = 'dj_pack_recipients';
export const DJ_PACK_ACCESS_LOG_TABLE = 'dj_pack_access_log';

export const SONG_COLUMNS =
  'id,owner_user_id,artist_id,release_id,title,duration_seconds,musical_key,bpm,notes,created_at,updated_at';

/** A song in the catalog. The join between a release and a show: the same row
 *  a rollout is built around is the one put into a set. */
export const toSong = (row: Record<string, unknown>) => ({
  id: String(row.id || ''),
  artistId: String(row.artist_id || ''),
  releaseId: row.release_id ? String(row.release_id) : null,
  title: String(row.title || ''),
  durationSeconds:
    typeof row.duration_seconds === 'number' && row.duration_seconds > 0
      ? row.duration_seconds
      : null,
  musicalKey: row.musical_key ? String(row.musical_key) : null,
  bpm: typeof row.bpm === 'number' ? row.bpm : null,
  notes: row.notes ? String(row.notes) : null,
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
});

export const SONG_VERSION_COLUMNS =
  'id,song_id,label,file_name,file_size,mime_type,storage_bucket,storage_path,duration_seconds,created_at';

export const EVENT_COLUMNS =
  'id,owner_user_id,artist_id,title,venue_name,city,country,timezone,set_start_at,' +
  'set_length_minutes,stage,promoter_name,promoter_phone,status,notes,' +
  'series_id,series_title,series_day,created_at,updated_at';

export const RUN_OF_SHOW_COLUMNS = 'id,event_id,label,at,position';

export const toRunOfShowItem = (row: Record<string, unknown>): RunOfShowItem => ({
  id: String(row.id || ''),
  eventId: String(row.event_id || ''),
  label: String(row.label || ''),
  at: row.at ? String(row.at) : null,
  position: typeof row.position === 'number' ? row.position : 0,
});

/** A team's whole schedule loads in one request; well above any real roster's
 *  year of shows. Revisit alongside a real pagination story, not before. */
export const EVENTS_LIST_LIMIT = 500;

/**
 * The whole events surface stays dark until NEXT_PUBLIC_FEATURE_EVENTS is
 * 'true'. Every handler checks this FIRST, before auth, so a direct API call
 * cannot reach the feature either and the 404 cannot be told apart from a
 * route that does not exist (the EPK / notes precedent).
 */
export const isEventsFeatureEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_EVENTS === 'true';

export const eventsDisabledResponse = () =>
  NextResponse.json({ error: 'Not found.' }, { status: 404 });

/**
 * The 404 body for "not yours / doesn't exist".
 *
 * Two constraints, both inherited from RELEASE_NOT_FOUND_MESSAGE and both
 * still binding here: never a 403 for a non-member, because a refusal must not
 * confirm the show exists; and never the exact string 'Not found.', which
 * lib/chappi/tool-families/shared.ts reads as "the feature flag is off" and
 * would report the feature as unavailable instead of the show as missing.
 */
export const EVENT_NOT_FOUND_MESSAGE = 'Show not found.';

/** Same two constraints as EVENT_NOT_FOUND_MESSAGE: never a 403 that confirms
 *  existence, and never the exact string 'Not found.'. */
export const SETLIST_NOT_FOUND_MESSAGE = 'Set not found.';

export const toShowEvent = (
  row: Record<string, unknown>,
  artistName = ''
): ShowEvent => ({
  id: String(row.id || ''),
  artistId: String(row.artist_id || ''),
  artistName,
  title: String(row.title || ''),
  venueName: row.venue_name ? String(row.venue_name) : null,
  city: row.city ? String(row.city) : null,
  country: row.country ? String(row.country) : null,
  timezone: String(row.timezone || 'Africa/Lagos'),
  setStartAt: row.set_start_at ? String(row.set_start_at) : null,
  setLengthMinutes:
    typeof row.set_length_minutes === 'number' ? row.set_length_minutes : 30,
  stage: row.stage ? String(row.stage) : null,
  promoterName: row.promoter_name ? String(row.promoter_name) : null,
  promoterPhone: row.promoter_phone ? String(row.promoter_phone) : null,
  status: (row.status as EventStatus) || 'draft',
  notes: row.notes ? String(row.notes) : null,
  seriesId: row.series_id ? String(row.series_id) : null,
  seriesTitle: row.series_title ? String(row.series_title) : null,
  seriesDay: typeof row.series_day === 'number' && row.series_day > 0 ? row.series_day : null,
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
});

/**
 * Narrow a Supabase row to a plain record.
 *
 * Needed because these selects pass a runtime-built column string, so
 * supabase-js widens `data` to include GenericStringError and refuses a direct
 * cast. One helper rather than `as unknown as` scattered through every handler.
 */
export const asRow = (value: unknown): Record<string, unknown> =>
  (value || {}) as Record<string, unknown>;

export type EventAccessResult =
  | { error: NextResponse }
  | { event: Record<string, unknown>; ownerUserId: string; artistId: string };

/**
 * Who may touch a show.
 *
 * REUSES decideReleaseAccess DELIBERATELY, rather than cloning the rule. That
 * function is named for releases but is generic in fact: it reads an owner id
 * and an artist id and consults the caller's workspace memberships and artist
 * scope. An event carries exactly those two fields, and the rule we want is
 * exactly the same one — a member sees the team's shows, an artist-scoped
 * member sees only their artist's, a guest is read-only, a non-member gets a
 * 404 that does not confirm existence.
 *
 * Cloning it would recreate the copy-propagation accident that release-access
 * was written to end (eleven route groups each carrying their own owner-only
 * check for a year). One rule, two object types.
 */
export async function ensureEventAccess(
  adminClient: SupabaseClient | null,
  eventId: string,
  user: User,
  write: boolean
): Promise<EventAccessResult> {
  if (!adminClient) {
    return {
      error: NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 }),
    };
  }

  const { data, error } = await adminClient
    .from(EVENTS_TABLE)
    .select(EVENT_COLUMNS)
    .eq('id', eventId)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load the show.' },
        { status: 500 }
      ),
    };
  }

  if (!data) {
    return { error: NextResponse.json({ error: EVENT_NOT_FOUND_MESSAGE }, { status: 404 }) };
  }

  const row = asRow(data);
  const ownerUserId = String(row.owner_user_id || '');
  const artistId = String(row.artist_id || '');

  const access = await loadWorkspaceAccessContext(adminClient, user);
  const decision = decideReleaseAccess({
    releaseOwnerId: ownerUserId,
    releaseArtistId: artistId,
    userId: user.id,
    access,
    write,
  });

  if (decision === 'not_found') {
    return { error: NextResponse.json({ error: EVENT_NOT_FOUND_MESSAGE }, { status: 404 }) };
  }
  if (decision === 'read_only') {
    return { error: buildReadOnlyResponse() };
  }

  return { event: row, ownerUserId, artistId };
}

/** Same two constraints as EVENT_NOT_FOUND_MESSAGE. Also what an artist on
 *  another team reads as, so this cannot be used to probe for ids. */
export const ARTIST_NOT_ON_ROSTER_MESSAGE = 'That artist is not on your roster.';

type WorkspaceAccessContext = Awaited<ReturnType<typeof loadWorkspaceAccessContext>>;

export type ArtistAccessResult =
  | { error: NextResponse }
  | {
      artist: WorkspaceArtist;
      /** Who new rows are stamped with: the ARTIST'S owner, never the acting
       *  teammate (see POST /api/events for why). */
      ownerUserId: string;
      access: WorkspaceAccessContext;
      roster: WorkspaceArtist[];
    };

/**
 * Who may create shows and songs for an artist, or read that artist's song
 * catalog.
 *
 * The create routes used to check only that the artist was on the caller's
 * roster (found 2026-09-25). That let a GUEST book shows and add songs, and let
 * an artist-scoped teammate book for — and read the catalog of — artists they
 * are meant never to see. Every other Shows route already ran the shared rule
 * through ensureEventAccess; this is the same rule for the one kind of request
 * that has no row yet, fed the artist's owner and id (the two fields
 * decideReleaseAccess reads).
 *
 * Ordering matches decideReleaseAccess: an artist outside your scope is
 * `not_found` (indistinguishable from one that does not exist), and only an
 * artist you can see can tell you that you are read-only.
 */
export async function ensureArtistAccess(
  adminClient: SupabaseClient | null,
  user: User,
  artistId: string,
  write: boolean
): Promise<ArtistAccessResult> {
  if (!adminClient) {
    return {
      error: NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 }),
    };
  }

  const access = await loadWorkspaceAccessContext(adminClient, user);
  if (!access.primaryWorkspaceId) {
    return { error: NextResponse.json({ error: 'No team found.' }, { status: 400 }) };
  }

  const roster = await listWorkspaceArtists(adminClient, access.primaryWorkspaceId);
  const artist = roster.find((candidate) => candidate.id === artistId);
  if (!artist) {
    return { error: NextResponse.json({ error: ARTIST_NOT_ON_ROSTER_MESSAGE }, { status: 404 }) };
  }

  const ownerUserId = artist.ownerUserId || user.id;
  const decision = decideReleaseAccess({
    releaseOwnerId: ownerUserId,
    releaseArtistId: artist.id,
    userId: user.id,
    access,
    write,
  });

  if (decision === 'not_found') {
    return { error: NextResponse.json({ error: ARTIST_NOT_ON_ROSTER_MESSAGE }, { status: 404 }) };
  }
  if (decision === 'read_only') {
    return { error: buildReadOnlyResponse() };
  }

  return { artist, ownerUserId, access, roster };
}

/**
 * The roster artists this caller may book a show for. The shows list sends it
 * so "Book a show" only offers artists the create route will accept, and hides
 * itself for a guest instead of opening a form that ends in a refusal.
 */
export function listBookableArtistIds(
  roster: readonly WorkspaceArtist[],
  user: User,
  access: WorkspaceAccessContext
): string[] {
  return roster
    .filter(
      (artist) =>
        decideReleaseAccess({
          releaseOwnerId: artist.ownerUserId || user.id,
          releaseArtistId: artist.id,
          userId: user.id,
          access,
          write: true,
        }) === 'allow'
    )
    .map((artist) => artist.id);
}

export const SETLIST_COLUMNS = 'id,owner_user_id,event_id,name,created_at,updated_at';

export const SETLIST_ITEM_COLUMNS =
  'id,setlist_id,item_type,song_id,song_version_id,position,duration_seconds,cue_note,label';

export type SetlistAccessResult =
  | { error: NextResponse }
  | {
      setlist: Record<string, unknown>;
      eventId: string;
      event: Record<string, unknown>;
      ownerUserId: string;
      artistId: string;
    };

/**
 * Who may touch a setlist: whoever may touch its show.
 *
 * Resolves the parent and delegates, rather than carrying its own rule. Two
 * reads instead of a join, which at one team's scale costs nothing and keeps
 * the access decision in exactly one place — the thing eleven release route
 * groups spent a year not doing.
 */
export async function ensureSetlistAccess(
  adminClient: SupabaseClient | null,
  setlistId: string,
  user: User,
  write: boolean
): Promise<SetlistAccessResult> {
  if (!adminClient) {
    return {
      error: NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 }),
    };
  }

  const { data, error } = await adminClient
    .from(SETLISTS_TABLE)
    .select(SETLIST_COLUMNS)
    .eq('id', setlistId)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load the set.' },
        { status: 500 }
      ),
    };
  }
  if (!data) {
    return { error: NextResponse.json({ error: SETLIST_NOT_FOUND_MESSAGE }, { status: 404 }) };
  }

  const setlist = asRow(data);
  const eventId = String(setlist.event_id || '');

  const eventAccess = await ensureEventAccess(adminClient, eventId, user, write);
  if ('error' in eventAccess) return eventAccess;

  return {
    setlist,
    eventId,
    event: eventAccess.event,
    ownerUserId: eventAccess.ownerUserId,
    artistId: eventAccess.artistId,
  };
}

export type SongAccessResult =
  | { error: NextResponse }
  | { song: Record<string, unknown>; ownerUserId: string; artistId: string };

/** Same two constraints as the other not-found strings. */
export const SONG_NOT_FOUND_MESSAGE = 'Song not found.';

/**
 * Who may touch a song: whoever may touch its artist's work.
 *
 * A song has no release, so decideReleaseAccess is fed the song's own owner
 * and artist — the two fields the rule actually reads. Same rule, third object
 * type (see ensureEventAccess for why this is reused rather than cloned).
 */
export async function ensureSongAccess(
  adminClient: SupabaseClient | null,
  songId: string,
  user: User,
  write: boolean
): Promise<SongAccessResult> {
  if (!adminClient) {
    return {
      error: NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 }),
    };
  }

  const { data, error } = await adminClient
    .from(SONGS_TABLE)
    .select(SONG_COLUMNS)
    .eq('id', songId)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load the song.' },
        { status: 500 }
      ),
    };
  }
  if (!data) {
    return { error: NextResponse.json({ error: SONG_NOT_FOUND_MESSAGE }, { status: 404 }) };
  }

  const song = asRow(data);
  const ownerUserId = String(song.owner_user_id || '');
  const artistId = String(song.artist_id || '');

  const access = await loadWorkspaceAccessContext(adminClient, user);
  const decision = decideReleaseAccess({
    releaseOwnerId: ownerUserId,
    releaseArtistId: artistId,
    userId: user.id,
    access,
    write,
  });

  if (decision === 'not_found') {
    return { error: NextResponse.json({ error: SONG_NOT_FOUND_MESSAGE }, { status: 404 }) };
  }
  if (decision === 'read_only') {
    return { error: buildReadOnlyResponse() };
  }

  return { song, ownerUserId, artistId };
}

/** True only when `versionId` is a file on `songId`. One read, scoped to both
 *  ids, so a version from any other song reads as missing. */
export async function versionBelongsToSong(
  adminClient: SupabaseClient,
  versionId: string,
  songId: string | null
): Promise<boolean> {
  if (!versionId || !songId) return false;
  const { data, error } = await adminClient
    .from(SONG_VERSIONS_TABLE)
    .select('id')
    .eq('id', versionId)
    .eq('song_id', songId)
    .maybeSingle();
  return !error && Boolean(data);
}
