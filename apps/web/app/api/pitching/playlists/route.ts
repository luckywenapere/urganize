import { NextRequest, NextResponse } from 'next/server';
import {
  BROWSE_LIST_LIMIT,
  CURATOR_PLAYLISTS_TABLE,
  flagOffResponse,
  isPitchingFeatureEnabled,
  loadCuratorNames,
  requireTeamUser,
  toBrowsablePlaylist,
} from '../_shared';
import { isPitchPlatform, normalizeGenreTags } from '@/lib/pitching';

/**
 * Every playlist a team can pitch to, with optional platform and genre filters.
 *
 * This is the one place the two sides of the product meet on a read, so note
 * what it returns: playlist fields plus the curator's display name. No email, no
 * curator id, no inbox. A team learns who owns a playlist and nothing else about
 * them.
 */
export async function GET(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const auth = await requireTeamUser(request);
  if ('error' in auth && auth.error) return auth.error;

  const url = new URL(request.url);
  const platformParam = url.searchParams.get('platform');
  const genreParam = url.searchParams.get('genre');

  if (platformParam && !isPitchPlatform(platformParam)) {
    return NextResponse.json({ error: 'That platform is not one we know.' }, { status: 400 });
  }

  let query = auth.adminClient
    .from(CURATOR_PLAYLISTS_TABLE)
    .select('id,curator_user_id,name,platform,genres,follower_count,url')
    // Biggest first, since that is the order a manager scans in. Nulls last so
    // a playlist with no self-reported number does not lead the list.
    .order('follower_count', { ascending: false, nullsFirst: false })
    .limit(BROWSE_LIST_LIMIT);

  if (platformParam) query = query.eq('platform', platformParam);
  if (genreParam) {
    const [genre] = normalizeGenreTags([genreParam]);
    if (genre) query = query.contains('genres', [genre]);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not load playlists.' },
      { status: 500 }
    );
  }

  const rows = (data || []) as Array<Record<string, unknown>>;
  const names = await loadCuratorNames(
    auth.adminClient,
    rows.map((row) => String(row.curator_user_id || ''))
  );

  return NextResponse.json({
    playlists: rows.map((row) =>
      toBrowsablePlaylist(row, names.get(String(row.curator_user_id || '')) || 'Playlist owner')
    ),
  });
}
