import { NextRequest, NextResponse } from 'next/server';
import {
  CURATOR_PLAYLISTS_TABLE,
  CURATOR_PLAYLIST_COLUMNS,
  CURATOR_PLAYLIST_LIST_LIMIT,
  flagOffResponse,
  isPitchingFeatureEnabled,
  parseFollowerCount,
  parseGenres,
  parsePlatform,
  parsePlaylistName,
  parsePlaylistUrl,
  requireCuratorUser,
  toCuratorPlaylist,
} from '../_shared';

// The curator's own playlists. This is the inventory pitchers browse, so it is
// also the only curator data a team ever sees, and only through the browse route
// (which adds the curator's display name and nothing else).

export async function GET(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const auth = await requireCuratorUser(request);
  if ('error' in auth) return auth.error;

  const { data, error } = await auth.adminClient
    .from(CURATOR_PLAYLISTS_TABLE)
    .select(CURATOR_PLAYLIST_COLUMNS)
    .eq('curator_user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(CURATOR_PLAYLIST_LIST_LIMIT);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not load your playlists.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    playlists: (data || []).map((row) => toCuratorPlaylist(row as Record<string, unknown>)),
  });
}

export async function POST(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const auth = await requireCuratorUser(request);
  if ('error' in auth) return auth.error;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const name = parsePlaylistName(payload.name);
  if ('error' in name) return name.error;

  const platform = parsePlatform(payload.platform);
  if ('error' in platform) return platform.error;

  const url = parsePlaylistUrl(payload.url);
  if ('error' in url) return url.error;

  const followerCount = parseFollowerCount(payload.followerCount);
  if ('error' in followerCount) return followerCount.error;

  const { data, error } = await auth.adminClient
    .from(CURATOR_PLAYLISTS_TABLE)
    .insert({
      curator_user_id: auth.user.id,
      name: name.value,
      platform: platform.value,
      url: url.value,
      genres: parseGenres(payload.genres),
      follower_count: followerCount.value,
    })
    .select(CURATOR_PLAYLIST_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Could not add the playlist.' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { playlist: toCuratorPlaylist(data as Record<string, unknown>) },
    { status: 201 }
  );
}
