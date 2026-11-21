import { NextRequest, NextResponse } from 'next/server';
import {
  createMusicServiceClient,
  loadLiveTracks,
  MUSIC_PAGE_SIZE,
} from '@/lib/music/server';
import { MUSIC_SAVED_LIMIT } from '@/lib/music/rules';

/**
 * The songs a listener may hear, newest first. PUBLIC: no sign-in, no plan, no
 * paywall. Listening needs no account, so this must never be wrapped in
 * requireActiveAuthenticatedUser (lib/music/music-public-guard.test.ts holds it).
 *
 *   ?q=      narrows by title or artist (every word has to match)
 *   ?offset= pages through the list, MUSIC_PAGE_SIZE at a time
 *   ?ids=    comma-separated song ids (a listener's saved songs); songs that are
 *            no longer live are simply left out
 */
export async function GET(request: NextRequest) {
  const adminClient = createMusicServiceClient();
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const params = request.nextUrl.searchParams;
  const query = (params.get('q') || '').trim().slice(0, 80);
  const offset = Number(params.get('offset'));

  const ids = (params.get('ids') || '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, MUSIC_SAVED_LIMIT);
  if (params.has('ids') && ids.length === 0) {
    return NextResponse.json({ tracks: [], artists: [], total: 0, nextOffset: null });
  }

  const result = await loadLiveTracks(adminClient, {
    query,
    ids: ids.length > 0 ? ids : undefined,
    offset: Number.isFinite(offset) ? offset : 0,
    limit: ids.length > 0 ? ids.length : MUSIC_PAGE_SIZE,
  });

  if (result.failed) {
    return NextResponse.json(
      { error: 'Could not load the songs. Try again.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const nextOffset = (Number.isFinite(offset) ? Math.max(0, offset) : 0) + result.tracks.length;
  return NextResponse.json(
    {
      tracks: result.tracks,
      // The artists behind the matches, for the search screen.
      artists: query ? result.artists.slice(0, 8) : [],
      total: result.total,
      nextOffset: nextOffset < result.total ? nextOffset : null,
    },
    // A song that goes live at midnight should show within a minute, so the edge
    // may keep a list for a few seconds and no longer.
    { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' } }
  );
}
