import { NextRequest, NextResponse } from 'next/server';
import {
  BROWSE_LIST_LIMIT,
  CURATOR_PLAYLISTS_TABLE,
  CURATOR_PROFILES_TABLE,
  flagOffResponse,
  isPitchingFeatureEnabled,
  loadCuratorNames,
  requireTeamUser,
  toBrowsablePlaylist,
} from '../_shared';
import { isPitchPlatform, normalizeGenreTags } from '@/lib/pitching';
import { isValidCuratorSlug } from '@/lib/curator-public';
import { isCuratorPageFeatureEnabled } from '@/lib/curator-public-server';

/**
 * Every playlist a team can pitch to, with optional platform and genre filters.
 *
 * This is the one place the two sides of the product meet on a read, so note
 * what it returns: playlist fields plus the curator's display name. No email, no
 * curator id, no inbox. A team learns who owns a playlist and nothing else about
 * them.
 *
 * ?curator= narrows the list to one curator, set when an artist arrives from her
 * public page at /pitch/{slug}. IT TAKES THE SLUG, NEVER A USER ID, and that is
 * what keeps the promise above intact: the id is resolved here and stays here,
 * so the response shape does not change and nothing hands a team a curator's
 * auth id. Do not add one to BrowsablePlaylist to make this easier.
 */
export async function GET(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const auth = await requireTeamUser(request);
  if ('error' in auth && auth.error) return auth.error;

  const url = new URL(request.url);
  const platformParam = url.searchParams.get('platform');
  const genreParam = url.searchParams.get('genre');
  const curatorParam = (url.searchParams.get('curator') || '').trim().toLowerCase();

  if (platformParam && !isPitchPlatform(platformParam)) {
    return NextResponse.json({ error: 'That platform is not one we know.' }, { status: 400 });
  }

  // Resolve the handle to the curator it belongs to. A slug that is malformed,
  // unknown or not published answers with an EMPTY list rather than an error:
  // the artist followed a link that has since been taken down, and an empty
  // browse with its own line reads better than a failure they cannot act on.
  let curatorUserId: string | null = null;
  if (curatorParam) {
    if (!isCuratorPageFeatureEnabled() || !isValidCuratorSlug(curatorParam)) {
      return NextResponse.json({ playlists: [] });
    }
    const { data: curatorRow } = await auth.adminClient
      .from(CURATOR_PROFILES_TABLE)
      .select('user_id,published_at')
      .eq('slug', curatorParam)
      .maybeSingle();
    const resolved = curatorRow as Record<string, unknown> | null;
    if (!resolved?.user_id || !resolved.published_at) {
      return NextResponse.json({ playlists: [] });
    }
    curatorUserId = String(resolved.user_id);
  }

  let query = auth.adminClient
    .from(CURATOR_PLAYLISTS_TABLE)
    .select('id,curator_user_id,name,platform,genres,follower_count,url')
    // Biggest first, since that is the order a manager scans in. Nulls last so
    // a playlist with no self-reported number does not lead the list.
    .order('follower_count', { ascending: false, nullsFirst: false })
    .limit(BROWSE_LIST_LIMIT);

  if (curatorUserId) query = query.eq('curator_user_id', curatorUserId);
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
