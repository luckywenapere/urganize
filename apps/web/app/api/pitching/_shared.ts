import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAuthenticatedAdmin } from '@/app/api/_shared/auth';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';
import {
  MAX_PITCH_NOTE_LENGTH,
  MAX_SONG_TITLE_LENGTH,
  isPitchPlatform,
  isPitchState,
  isValidSongUrl,
} from '@/lib/pitching';
import type { BrowsablePlaylist, SentPitch } from '@/types/pitching';

// Shared helpers for the team side of playlist pitching.
//
// No schema-missing fallback here on purpose: environments are assumed migrated
// (CLAUDE.md "Patterns being deprecated in v1"); a missing table surfaces as a
// normal 500. This module also never imports app/api/releases/_shared.ts, whose
// module carries the deprecated helpers the guard test freezes.

export {
  createAdminClient,
  requireAuthenticatedAdmin,
  requireActiveAuthenticatedUser,
} from '@/app/api/_shared/auth';

export const PITCHES_TABLE = 'playlist_pitches';
export const CURATOR_PLAYLISTS_TABLE = 'curator_playlists';
export const CURATOR_PROFILES_TABLE = 'curator_profiles';

/**
 * What the team sees about its own pitches.
 *
 * `release_id` is here for the team-wide list (2026-09-09): that read spans
 * every release, so a row has to say which one it belongs to. It is also what
 * the access filter keys off. Note the CURATOR's own columns are a different,
 * narrower set — see CURATOR_PITCH_COLUMNS in the curator route group, which
 * deliberately carries no release id at all.
 */
export const SENT_PITCH_COLUMNS =
  'id,release_id,playlist_id,playlist_name,curator_user_id,song_title,song_url,song_platform,note,status,curator_reply,pitcher_name,created_at,updated_at';

/**
 * What a paid pitch adds for the sending team: whether it was paid for and when
 * the curator's reply is due. Selected ONLY while curator pitch payments are
 * switched on, so the list keeps working on a database the payments migration
 * has not reached yet.
 */
export const SENT_PITCH_PAYMENT_COLUMNS = 'payment_kind,response_due_at';

export const sentPitchColumns = (withPayments: boolean): string =>
  withPayments ? `${SENT_PITCH_COLUMNS},${SENT_PITCH_PAYMENT_COLUMNS}` : SENT_PITCH_COLUMNS;

export const BROWSE_LIST_LIMIT = 200;
export const SENT_PITCH_LIST_LIMIT = 200;

export const isPitchingFeatureEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';

export const flagOffResponse = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

/**
 * Auth for the team side. requireAuthenticatedAdmin already rejects curator
 * accounts (see blockCuratorAccount in app/api/_shared/auth.ts), so a playlist
 * owner cannot reach the browse or send routes at all.
 */
export async function requireTeamUser(request: NextRequest) {
  return requireAuthenticatedAdmin(request);
}

/**
 * Can this user see this release? Owner, or a member of a workspace whose owner
 * owns it — the same releaseOwnerIds model the releases list uses, so pitching
 * inherits whole-team visibility rather than inventing its own rule.
 *
 * 404 (never 403) when the release is missing or invisible: the caller should
 * not learn that a release they cannot see exists.
 */
export async function ensureReleaseVisible(
  adminClient: SupabaseClient,
  releaseId: string,
  user: { id: string; email?: string | null }
): Promise<{ error: NextResponse } | { ownerUserId: string; artistName: string; title: string }> {
  const { data: release, error } = await adminClient
    .from('releases')
    .select('id,owner_user_id,artist_name,title')
    .eq('id', releaseId)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load rollout.' },
        { status: 500 }
      ),
    };
  }
  if (!release) {
    return { error: NextResponse.json({ error: 'Rollout not found.' }, { status: 404 }) };
  }

  const ownerUserId = String(release.owner_user_id || '');
  if (ownerUserId !== user.id) {
    const access = await loadWorkspaceAccessContext(adminClient, user as never);
    if (!access.releaseOwnerIds.includes(ownerUserId)) {
      return { error: NextResponse.json({ error: 'Rollout not found.' }, { status: 404 }) };
    }
  }

  return {
    ownerUserId,
    artistName: String(release.artist_name || ''),
    title: String(release.title || ''),
  };
}

/**
 * A playlist as a browsing team sees it. `price` is passed only while curator
 * pitch payments are switched on: its presence adds the two price keys, and its
 * absence leaves the payload exactly what it was before payments existed.
 */
export const toBrowsablePlaylist = (
  row: Record<string, unknown>,
  curatorName: string,
  price?: { priceKobo: number | null; responseWindowHours: number } | null
): BrowsablePlaylist => {
  const playlist: BrowsablePlaylist = {
    id: String(row.id || ''),
    name: typeof row.name === 'string' ? row.name : '',
    curatorName,
    platform: isPitchPlatform(row.platform) ? row.platform : 'other',
    genres: Array.isArray(row.genres) ? row.genres.map((tag) => String(tag)) : [],
    followerCount: typeof row.follower_count === 'number' ? row.follower_count : null,
    url: typeof row.url === 'string' ? row.url : '',
  };
  if (price) {
    playlist.pitchPriceKobo = price.priceKobo;
    playlist.responseWindowHours = price.priceKobo === null ? null : price.responseWindowHours;
  }
  return playlist;
};

/**
 * One pitch as the sending team sees it.
 *
 * `releaseTitle` is passed in rather than read off the row: a pitch stores the
 * SONG title and the artist name, never the release's own title, so the caller
 * resolves it — from the release it already loaded (the per-release list) or
 * from one lookup over the set (the team-wide list). Null means the release was
 * deleted after the pitch went out; `release_id` is `on delete set null`, so
 * the pitch legitimately outlives it and the UI says so rather than hiding it.
 */
export const toSentPitch = (
  row: Record<string, unknown>,
  curatorName: string,
  releaseTitle: string | null = null,
  payment?: { priceKobo: number | null } | null
): SentPitch => {
  const pitch: SentPitch = {
    id: String(row.id || ''),
    releaseId: row.release_id ? String(row.release_id) : null,
    releaseTitle,
    playlistId: row.playlist_id ? String(row.playlist_id) : null,
    playlistName: typeof row.playlist_name === 'string' ? row.playlist_name : '',
    curatorName,
    songTitle: typeof row.song_title === 'string' ? row.song_title : '',
    songUrl: typeof row.song_url === 'string' ? row.song_url : '',
    songPlatform: isPitchPlatform(row.song_platform) ? row.song_platform : null,
    note: typeof row.note === 'string' ? row.note : '',
    // Every state, including the two only the system sets. Reading an unpaid
    // or refunded pitch as 'new' would tell a team a curator has it when no
    // curator does.
    status: isPitchState(row.status) ? row.status : 'new',
    reply: typeof row.curator_reply === 'string' && row.curator_reply ? row.curator_reply : null,
    pitcherName: typeof row.pitcher_name === 'string' ? row.pitcher_name : '',
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
  // Payment fields only when they were selected, so the payload is unchanged
  // with pitch payments switched off.
  if ('payment_kind' in row) {
    const paid = row.payment_kind === 'paid';
    pitch.paymentKind = paid ? 'paid' : 'free';
    pitch.responseDueAt = paid && typeof row.response_due_at === 'string' ? row.response_due_at : null;
    pitch.priceKobo = paid ? payment?.priceKobo ?? null : null;
  }
  return pitch;
};

/**
 * The song fields of a pitch, validated once for both ways of sending one: the
 * free POST /api/pitching/pitches and the paid POST /api/pitching/quote.
 */
export function parsePitchSongFields(
  payload: Record<string, unknown>
): { error: NextResponse } | { songTitle: string; songUrl: string; note: string } {
  const songTitle = typeof payload.songTitle === 'string' ? payload.songTitle.trim() : '';
  if (!songTitle) {
    return { error: NextResponse.json({ error: 'Add the song title.' }, { status: 400 }) };
  }
  if (songTitle.length > MAX_SONG_TITLE_LENGTH) {
    return {
      error: NextResponse.json(
        { error: `Song title must be under ${MAX_SONG_TITLE_LENGTH} characters.` },
        { status: 400 }
      ),
    };
  }

  const songUrl = typeof payload.songUrl === 'string' ? payload.songUrl.trim() : '';
  if (!isValidSongUrl(songUrl)) {
    return {
      error: NextResponse.json({ error: 'Add a link to the song, starting with https.' }, { status: 400 }),
    };
  }

  const note = typeof payload.note === 'string' ? payload.note.trim() : '';
  if (note.length > MAX_PITCH_NOTE_LENGTH) {
    return {
      error: NextResponse.json(
        { error: `Keep the note under ${MAX_PITCH_NOTE_LENGTH} characters.` },
        { status: 400 }
      ),
    };
  }

  return { songTitle, songUrl, note };
}

/** The name the curator sees on the card. Falls back to the email handle. */
export async function resolvePitcherName(
  adminClient: SupabaseClient,
  user: { id: string; email?: string | null }
): Promise<string> {
  const { data } = await adminClient
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .maybeSingle();

  const name = typeof data?.name === 'string' ? data.name.trim() : '';
  if (name) return name.slice(0, 120);
  const handle = String(user.email || '').split('@')[0];
  return (handle || 'A manager').slice(0, 120);
}

/**
 * Curator display names for a set of user ids.
 *
 * A separate query rather than a PostREST embed: curator_profiles and the tables
 * pointing at it both reference auth.users, and there is no FK between them for
 * the embed syntax to traverse.
 */
export async function loadCuratorNames(
  adminClient: SupabaseClient,
  curatorUserIds: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = Array.from(new Set(curatorUserIds.filter(Boolean)));
  if (!ids.length) return names;
  const { data } = await adminClient
    .from(CURATOR_PROFILES_TABLE)
    .select('user_id,display_name')
    .in('user_id', ids);
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    names.set(String(row.user_id || ''), String(row.display_name || ''));
  }
  return names;
}
