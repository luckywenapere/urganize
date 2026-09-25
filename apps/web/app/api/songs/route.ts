import { NextRequest, NextResponse } from 'next/server';
import {
  SONGS_TABLE,
  SONG_COLUMNS,
  asRow,
  createAdminClient,
  ensureArtistAccess,
  eventsDisabledResponse,
  isEventsFeatureEnabled,
  requireActiveAuthenticatedUser,
  toSong,
} from '@/app/api/events/_shared';
import { parseSongCreate } from '@/lib/song-catalog';

/** GET /api/songs?artistId=… — the catalog the setlist builder picks from. */
export async function GET(request: NextRequest) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const artistId = request.nextUrl.searchParams.get('artistId')?.trim() || '';
  if (!artistId) {
    return NextResponse.json({ error: 'Which artist?' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  // Visibility of the artist, through the shared rule: an artist-scoped
  // teammate reads only their own artist's catalog (ensureArtistAccess).
  const resolved = await ensureArtistAccess(adminClient, auth.user, artistId, false);
  if ('error' in resolved) return resolved.error;

  const { data, error } = await adminClient
    .from(SONGS_TABLE)
    .select(SONG_COLUMNS)
    .eq('artist_id', artistId)
    .order('title', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not load the catalog.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ songs: (data || []).map((row) => toSong(asRow(row))) });
}

/**
 * POST /api/songs — add a song to the catalog.
 *
 * Only a title is required, because the setlist builder needs to accept "add
 * the new one" mid-build. Everything else can be filled in later, and a
 * missing duration is handled honestly by the running total rather than
 * counted as zero.
 */
export async function POST(request: NextRequest) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Send the song.' }, { status: 400 });
  }

  const artistId = typeof body.artistId === 'string' ? body.artistId.trim() : '';
  if (!artistId) {
    return NextResponse.json({ error: 'Which artist?' }, { status: 400 });
  }

  // One definition of a valid song, shared with PATCH /api/songs/[songId].
  const parsed = parseSongCreate(body);
  if (parsed.errors.length > 0) {
    return NextResponse.json(
      { error: parsed.errors[0].message, fieldErrors: parsed.errors },
      { status: 400 }
    );
  }
  const columns = parsed.columns;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  // Write access to the artist: a guest cannot add to the catalog, and a
  // scoped teammate adds only to their own artist's (ensureArtistAccess).
  const resolved = await ensureArtistAccess(adminClient, auth.user, artistId, true);
  if ('error' in resolved) return resolved.error;

  // Stamped with the ARTIST's owner, never the acting teammate — the same rule
  // events follow, and for the same reason: a song owned by a teammate would
  // sit in a workspace the rest of the team cannot read.
  const { data, error } = await adminClient
    .from(SONGS_TABLE)
    .insert({
      ...columns,
      artist_id: resolved.artist.id,
      owner_user_id: resolved.ownerUserId,
    })
    .select(SONG_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Could not add the song.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ song: toSong(asRow(data)) }, { status: 201 });
}
