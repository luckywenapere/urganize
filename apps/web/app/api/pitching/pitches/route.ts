import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CURATOR_PLAYLISTS_TABLE,
  PITCHES_TABLE,
  SENT_PITCH_COLUMNS,
  SENT_PITCH_LIST_LIMIT,
  ensureReleaseVisible,
  flagOffResponse,
  isPitchingFeatureEnabled,
  loadCuratorNames,
  requireTeamUser,
  toSentPitch,
} from '../_shared';
import {
  MAX_PITCH_NOTE_LENGTH,
  MAX_SONG_TITLE_LENGTH,
  MAX_WAITING_PITCHES_PER_RELEASE,
  detectPitchPlatform,
  isValidSongUrl,
} from '@/lib/pitching';
import { decideReleaseAccess } from '@/lib/release-access';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';

/**
 * Pitches this team has sent, newest first.
 *
 * TWO MODES, and `releaseId` is what picks between them:
 *
 *   - With it: one release's pitches, exactly as this route has always
 *     behaved — visibility checked through ensureReleaseVisible, one query
 *     filtered on that release. This is what the release scene calls.
 *   - Without it: every release's, for the Pitching page (2026-09-09, founder:
 *     "Playlist pitching should be accessible app wide"). Before that page
 *     existed there was nowhere to ask this question from, which is why the
 *     param used to be required.
 *
 * THE TEAM-WIDE READ IS FILTERED TWICE, and the second filter is the one that
 * matters. Owner ids alone would hand an artist-scoped teammate every pitch
 * their team ever sent, including ones for releases they are not allowed to
 * see — `releaseOwnerIds` is a team boundary, not a per-release one. So the
 * referenced releases are loaded and each row is put through the shared
 * decideReleaseAccess, the same rule the events list uses for the same reason.
 * Cloning that rule as SQL is how eleven route groups drifted apart.
 *
 * A pitch whose release was deleted (`release_id` null) survives the filter on
 * the owner check alone: it is this team's own pitch, the curator may still be
 * sitting on it, and hiding it would lose the answer. The page labels it.
 */
export async function GET(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const auth = await requireTeamUser(request);
  if ('error' in auth && auth.error) return auth.error;

  const releaseId = new URL(request.url).searchParams.get('releaseId') || '';

  if (releaseId) {
    const visible = await ensureReleaseVisible(auth.adminClient, releaseId, auth.user);
    if ('error' in visible) return visible.error;

    const { data, error } = await auth.adminClient
      .from(PITCHES_TABLE)
      .select(SENT_PITCH_COLUMNS)
      .eq('release_id', releaseId)
      .order('created_at', { ascending: false })
      .limit(SENT_PITCH_LIST_LIMIT);

    if (error) {
      return NextResponse.json(
        { error: error.message || 'Could not load pitches.' },
        { status: 500 }
      );
    }

    const rows = (data || []) as Array<Record<string, unknown>>;
    const names = await loadCuratorNames(
      auth.adminClient,
      rows.map((row) => String(row.curator_user_id || ''))
    );

    return NextResponse.json({
      pitches: rows.map((row) =>
        toSentPitch(
          row,
          names.get(String(row.curator_user_id || '')) || 'Playlist owner',
          visible.title || null
        )
      ),
    });
  }

  const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user as never);
  const ownerIds = access.releaseOwnerIds.length ? access.releaseOwnerIds : [auth.user.id];

  const { data, error } = await auth.adminClient
    .from(PITCHES_TABLE)
    .select(SENT_PITCH_COLUMNS)
    .in('owner_user_id', ownerIds)
    .order('created_at', { ascending: false })
    .limit(SENT_PITCH_LIST_LIMIT);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not load pitches.' },
      { status: 500 }
    );
  }

  const rows = (data || []) as Array<Record<string, unknown>>;
  const releases = await loadPitchReleases(
    auth.adminClient,
    rows.map((row) => String(row.release_id || ''))
  );

  const readable = rows.filter((row) => {
    const rowReleaseId = String(row.release_id || '');
    // A deleted release leaves nothing to check beyond the owner filter above.
    if (!rowReleaseId) return true;
    const release = releases.get(rowReleaseId);
    // A release we cannot read back is one this caller should not be told
    // about: fail closed, unlike the counts elsewhere in this app, because the
    // cost here is showing somebody another artist's work rather than refusing
    // an action they could retry.
    if (!release) return false;
    return (
      decideReleaseAccess({
        releaseOwnerId: release.ownerUserId,
        releaseArtistId: release.artistId,
        userId: auth.user.id,
        access,
        write: false,
      }) === 'allow'
    );
  });

  const names = await loadCuratorNames(
    auth.adminClient,
    readable.map((row) => String(row.curator_user_id || ''))
  );

  return NextResponse.json({
    pitches: readable.map((row) =>
      toSentPitch(
        row,
        names.get(String(row.curator_user_id || '')) || 'Playlist owner',
        releases.get(String(row.release_id || ''))?.title || null
      )
    ),
    // The list is capped, so say when it was cut rather than letting the page
    // imply it is showing everything.
    truncated: rows.length >= SENT_PITCH_LIST_LIMIT,
  });
}

/** The releases a set of pitches point at, for the access filter and the title. */
async function loadPitchReleases(
  adminClient: SupabaseClient,
  releaseIds: string[]
): Promise<Map<string, { ownerUserId: string; artistId: string; title: string }>> {
  const found = new Map<string, { ownerUserId: string; artistId: string; title: string }>();
  const ids = Array.from(new Set(releaseIds.filter(Boolean)));
  if (!ids.length) return found;

  const { data } = await adminClient
    .from('releases')
    .select('id,owner_user_id,artist_id,title')
    .in('id', ids);

  for (const row of (data || []) as Array<Record<string, unknown>>) {
    found.set(String(row.id || ''), {
      ownerUserId: String(row.owner_user_id || ''),
      artistId: String(row.artist_id || ''),
      title: String(row.title || ''),
    });
  }
  return found;
}

/**
 * Sends one pitch.
 *
 * Everything the curator card renders is written here, denormalized: the song
 * title and artist name, the playlist name, and who sent it. That is what keeps
 * the curator's read path away from team data entirely.
 *
 * Two brakes, both enforced server-side because a client cannot be trusted with
 * either: at most ten pitches waiting per release, and at most one waiting pitch
 * per playlist (a unique partial index, so a race loses at the database rather
 * than slipping through).
 *
 * Pitching to your OWN playlist is allowed and needs no guard: a dual account
 * (team + playlist owner) simply matches both of playlist_pitches' select
 * policies on the same row, and every cap above still applies. It is also the
 * cheapest way to try the round trip end to end.
 */
export async function POST(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const auth = await requireTeamUser(request);
  if ('error' in auth && auth.error) return auth.error;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const releaseId = typeof payload.releaseId === 'string' ? payload.releaseId : '';
  const playlistId = typeof payload.playlistId === 'string' ? payload.playlistId : '';
  if (!releaseId || !playlistId) {
    return NextResponse.json({ error: 'Pick a release and a playlist.' }, { status: 400 });
  }

  const songTitle = typeof payload.songTitle === 'string' ? payload.songTitle.trim() : '';
  if (!songTitle) {
    return NextResponse.json({ error: 'Add the song title.' }, { status: 400 });
  }
  if (songTitle.length > MAX_SONG_TITLE_LENGTH) {
    return NextResponse.json(
      { error: `Song title must be under ${MAX_SONG_TITLE_LENGTH} characters.` },
      { status: 400 }
    );
  }

  const songUrl = typeof payload.songUrl === 'string' ? payload.songUrl.trim() : '';
  if (!isValidSongUrl(songUrl)) {
    return NextResponse.json(
      { error: 'Add a link to the song, starting with https.' },
      { status: 400 }
    );
  }

  const note = typeof payload.note === 'string' ? payload.note.trim() : '';
  if (note.length > MAX_PITCH_NOTE_LENGTH) {
    return NextResponse.json(
      { error: `Keep the note under ${MAX_PITCH_NOTE_LENGTH} characters.` },
      { status: 400 }
    );
  }

  const visible = await ensureReleaseVisible(auth.adminClient, releaseId, auth.user);
  if ('error' in visible) return visible.error;

  const { data: playlist, error: playlistError } = await auth.adminClient
    .from(CURATOR_PLAYLISTS_TABLE)
    .select('id,name,curator_user_id')
    .eq('id', playlistId)
    .maybeSingle();

  if (playlistError) {
    return NextResponse.json(
      { error: playlistError.message || 'Could not load the playlist.' },
      { status: 500 }
    );
  }
  if (!playlist) {
    return NextResponse.json({ error: 'Playlist not found.' }, { status: 404 });
  }

  // The waiting-pitch cap. There is a small window between this count and the
  // insert below; at this scale one extra pitch slipping through is a better
  // trade than locking the table, and the per-playlist unique index still holds.
  const { count: waitingCount, error: countError } = await auth.adminClient
    .from(PITCHES_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('release_id', releaseId)
    .eq('status', 'new');

  if (countError) {
    return NextResponse.json(
      { error: countError.message || 'Could not check your pitches.' },
      { status: 500 }
    );
  }
  if ((waitingCount || 0) >= MAX_WAITING_PITCHES_PER_RELEASE) {
    return NextResponse.json(
      {
        error: `This release already has ${MAX_WAITING_PITCHES_PER_RELEASE} pitches waiting. Wait for replies before sending more.`,
      },
      { status: 409 }
    );
  }

  const pitcherName = await resolvePitcherName(auth.adminClient, auth.user);

  const { data, error } = await auth.adminClient
    .from(PITCHES_TABLE)
    .insert({
      release_id: releaseId,
      owner_user_id: visible.ownerUserId,
      created_by: auth.user.id,
      pitcher_name: pitcherName,
      curator_user_id: String(playlist.curator_user_id || ''),
      playlist_id: playlistId,
      playlist_name: String(playlist.name || ''),
      song_title: songTitle,
      artist_name: visible.artistName || visible.title || 'Unknown artist',
      song_url: songUrl,
      song_platform: detectPitchPlatform(songUrl),
      note,
    })
    .select(SENT_PITCH_COLUMNS)
    .maybeSingle();

  if (error) {
    // 23505: the one-waiting-pitch-per-playlist index caught a duplicate.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'This playlist already has a pitch waiting for this release.' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Could not send the pitch.' },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: 'Could not send the pitch.' }, { status: 500 });
  }

  const names = await loadCuratorNames(auth.adminClient, [String(playlist.curator_user_id || '')]);

  return NextResponse.json(
    {
      pitch: toSentPitch(
        data as Record<string, unknown>,
        names.get(String(playlist.curator_user_id || '')) || 'Playlist owner',
        // So a pitch sent from the Pitching page lands in the right group
        // without waiting for a refetch.
        visible.title || null
      ),
    },
    { status: 201 }
  );
}

/** The name the curator sees on the card. Falls back to the email handle. */
async function resolvePitcherName(
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
