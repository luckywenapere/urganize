import { NextRequest, NextResponse } from 'next/server';
import {
  CURATOR_PLAYLISTS_TABLE,
  CURATOR_PLAYLIST_COLUMNS,
  flagOffResponse,
  isPitchingFeatureEnabled,
  parseFollowerCount,
  parseGenres,
  parsePlatform,
  parsePlaylistName,
  parsePlaylistUrl,
  requireCuratorUser,
  toCuratorPlaylist,
} from '../../_shared';

// Editing and removing one playlist. Ownership lives in the statement itself
// (.eq('curator_user_id', ...)), so there is no read-then-write window, and a
// playlist that is missing or someone else's returns 404, never 403.

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ playlistId: string }> }
) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const auth = await requireCuratorUser(request);
  if ('error' in auth) return auth.error;

  const { playlistId } = await context.params;
  if (!playlistId) {
    return NextResponse.json({ error: 'Playlist id is required.' }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const updates: Record<string, unknown> = {};

  if ('name' in payload) {
    const parsed = parsePlaylistName(payload.name);
    if ('error' in parsed) return parsed.error;
    updates.name = parsed.value;
  }
  if ('platform' in payload) {
    const parsed = parsePlatform(payload.platform);
    if ('error' in parsed) return parsed.error;
    updates.platform = parsed.value;
  }
  if ('url' in payload) {
    const parsed = parsePlaylistUrl(payload.url);
    if ('error' in parsed) return parsed.error;
    updates.url = parsed.value;
  }
  if ('followerCount' in payload) {
    const parsed = parseFollowerCount(payload.followerCount);
    if ('error' in parsed) return parsed.error;
    updates.follower_count = parsed.value;
  }
  if ('genres' in payload) {
    updates.genres = parseGenres(payload.genres);
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  }

  const { data, error } = await auth.adminClient
    .from(CURATOR_PLAYLISTS_TABLE)
    .update(updates)
    .eq('id', playlistId)
    .eq('curator_user_id', auth.user.id)
    .select(CURATOR_PLAYLIST_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not save the playlist.' },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: 'Playlist not found.' }, { status: 404 });
  }

  return NextResponse.json({ playlist: toCuratorPlaylist(data as Record<string, unknown>) });
}

/**
 * Removing a playlist keeps every pitch ever sent to it: the pitch row carries
 * its own copy of the playlist name and the FK is `on delete set null`, so both
 * sides keep their history. Idempotent, like every other delete here.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ playlistId: string }> }
) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const auth = await requireCuratorUser(request);
  if ('error' in auth) return auth.error;

  const { playlistId } = await context.params;
  if (!playlistId) {
    return NextResponse.json({ error: 'Playlist id is required.' }, { status: 400 });
  }

  const { error } = await auth.adminClient
    .from(CURATOR_PLAYLISTS_TABLE)
    .delete()
    .eq('id', playlistId)
    .eq('curator_user_id', auth.user.id);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not remove the playlist.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
