import { NextRequest, NextResponse } from 'next/server';
import { listWorkspaceArtists } from '@/lib/artists-server';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';
import {
  SONGS_TABLE,
  SONG_COLUMNS,
  asRow,
  createAdminClient,
  eventsDisabledResponse,
  isEventsFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '@/app/api/events/_shared';

/** A song in the catalog. The join between a release and a show: the same row
 *  a rollout is built around is the one dragged into a setlist. */
const toSong = (row: Record<string, unknown>) => ({
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

const MAX_SONG_TITLE_LENGTH = 200;
/** Twenty minutes, matching the setlist item ceiling — a longer "song" is a
 *  typo, and one bad number quietly doubles a set. */
const MAX_SONG_DURATION_SECONDS = 20 * 60;

/**
 * Resolves the artist the caller is asking about and confirms it is on their
 * roster. Resolving through the roster rather than reading the artist row and
 * comparing afterwards means an artist on another team is indistinguishable
 * from one that does not exist, so this cannot be used to probe for ids.
 */
async function resolveArtist(
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
  user: Parameters<typeof loadWorkspaceAccessContext>[1],
  artistId: string
) {
  const access = await loadWorkspaceAccessContext(adminClient, user);
  if (!access.primaryWorkspaceId) {
    return { error: NextResponse.json({ error: 'No team found.' }, { status: 400 }) };
  }
  const roster = await listWorkspaceArtists(adminClient, access.primaryWorkspaceId);
  const artist = roster.find((candidate) => candidate.id === artistId);
  if (!artist) {
    return {
      error: NextResponse.json({ error: 'That artist is not on your roster.' }, { status: 404 }),
    };
  }
  return { artist };
}

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

  const resolved = await resolveArtist(adminClient, auth.user, artistId);
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

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return NextResponse.json({ error: 'What is the song called?' }, { status: 400 });
  }
  if (title.length > MAX_SONG_TITLE_LENGTH) {
    return NextResponse.json({ error: 'That title is too long.' }, { status: 400 });
  }

  const columns: Record<string, unknown> = { title };

  if (body.durationSeconds !== undefined && body.durationSeconds !== null) {
    const duration = body.durationSeconds;
    if (
      typeof duration !== 'number' ||
      !Number.isInteger(duration) ||
      duration <= 0 ||
      duration > MAX_SONG_DURATION_SECONDS
    ) {
      return NextResponse.json(
        { error: 'How long is it? Give a length in seconds, under twenty minutes.' },
        { status: 400 }
      );
    }
    columns.duration_seconds = duration;
  }

  if (body.bpm !== undefined && body.bpm !== null) {
    const bpm = body.bpm;
    if (typeof bpm !== 'number' || !Number.isInteger(bpm) || bpm <= 0 || bpm >= 400) {
      return NextResponse.json({ error: 'That BPM is not a real tempo.' }, { status: 400 });
    }
    columns.bpm = bpm;
  }

  if (typeof body.musicalKey === 'string') {
    columns.musical_key = body.musicalKey.trim() || null;
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  const resolved = await resolveArtist(adminClient, auth.user, artistId);
  if ('error' in resolved) return resolved.error;

  // Stamped with the ARTIST's owner, never the acting teammate — the same rule
  // events follow, and for the same reason: a song owned by a teammate would
  // sit in a workspace the rest of the team cannot read.
  const { data, error } = await adminClient
    .from(SONGS_TABLE)
    .insert({
      ...columns,
      artist_id: resolved.artist.id,
      owner_user_id: resolved.artist.ownerUserId || auth.user.id,
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
