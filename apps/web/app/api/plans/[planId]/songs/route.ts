import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  ensureReleaseOwnership,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  RELEASE_SONGS_SQL,
  RELEASE_SONGS_TABLE,
} from '../../_shared';
import { SONG_CONTRIBUTORS_TABLE, SONGS_TABLE } from '@/app/api/songs/_shared';

type SongRow = {
  id: string;
  song_title: string;
  primary_artist: string;
  isrc: string | null;
  duration: string | null;
  updated_at: string;
};

const toSongSummary = (
  row: SongRow,
  contributorCount: number,
  trackNumber: number | null,
  relationId: string | null = null
) => ({
  id: relationId || row.id,
  songId: row.id,
  songTitle: row.song_title,
  primaryArtist: row.primary_artist,
  isrc: String(row.isrc || ''),
  duration: String(row.duration || ''),
  contributorCount,
  trackNumber,
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ planId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { planId } = await context.params;
  if (!planId) return NextResponse.json({ error: 'Plan id is required' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, planId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const { data: relationRows, error: relationError } = await adminClient!
    .from(RELEASE_SONGS_TABLE)
    .select('id,song_id,track_number')
    .eq('release_id', planId)
    .order('track_number', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (relationError) {
    if (isOptionalTableMissingError(relationError)) {
      return NextResponse.json({ error: 'Release song links table is missing.', sql: RELEASE_SONGS_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: relationError.message || 'Could not load release songs.' }, { status: 500 });
  }

  const attachedSongIds = (relationRows || []).map((row) => row.song_id);

  const [{ data: attachedSongsData, error: attachedSongsError }, { data: allSongsData, error: allSongsError }] =
    await Promise.all([
      attachedSongIds.length > 0
        ? adminClient!
            .from(SONGS_TABLE)
            .select('id,song_title,primary_artist,isrc,duration,updated_at')
            .in('id', attachedSongIds)
        : Promise.resolve({ data: [], error: null } as any),
      adminClient!
        .from(SONGS_TABLE)
        .select('id,song_title,primary_artist,isrc,duration,updated_at')
        .eq('user_id', auth.user.id)
        .order('updated_at', { ascending: false }),
    ]);

  const dataError = attachedSongsError || allSongsError;
  if (dataError) {
    if (isOptionalTableMissingError(dataError)) {
      return NextResponse.json({ error: 'Song library tables are missing.', sql: RELEASE_SONGS_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: dataError.message || 'Could not load release songs.' }, { status: 500 });
  }

  const allSongIds = ((allSongsData || []) as SongRow[]).map((song) => song.id);
  const { data: contributorRows, error: contributorError } = allSongIds.length > 0
    ? await adminClient!
        .from(SONG_CONTRIBUTORS_TABLE)
        .select('song_id')
        .in('song_id', allSongIds)
    : { data: [], error: null };

  if (contributorError) {
    if (isOptionalTableMissingError(contributorError)) {
      return NextResponse.json({ error: 'Song library tables are missing.', sql: RELEASE_SONGS_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: contributorError.message || 'Could not load release songs.' }, { status: 500 });
  }

  const contributorCounts = new Map<string, number>();
  for (const row of contributorRows || []) {
    const songId = String(row.song_id || '');
    contributorCounts.set(songId, (contributorCounts.get(songId) || 0) + 1);
  }

  const attachedSongMap = new Map<string, SongRow>();
  for (const song of (attachedSongsData || []) as SongRow[]) {
    attachedSongMap.set(song.id, song);
  }

  const attachedSongs = (relationRows || [])
    .map((relation) => {
      const song = attachedSongMap.get(String(relation.song_id));
      if (!song) return null;
      return toSongSummary(song, contributorCounts.get(song.id) || 0, relation.track_number, relation.id);
    })
    .filter(Boolean);

  const attachedIdSet = new Set(attachedSongIds);
  const availableSongs = ((allSongsData || []) as SongRow[])
    .filter((song) => !attachedIdSet.has(song.id))
    .map((song) => toSongSummary(song, contributorCounts.get(song.id) || 0, null));

  return NextResponse.json({
    songs: {
      attached: attachedSongs,
      available: availableSongs,
    },
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ planId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { planId } = await context.params;
  if (!planId) return NextResponse.json({ error: 'Plan id is required' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, planId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const body = await request.json().catch(() => ({}));
  const songIds = Array.isArray(body?.songIds)
    ? body.songIds.map((item: unknown) => String(item || '').trim()).filter(Boolean)
    : [];

  if (songIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one song to attach.' }, { status: 400 });
  }

  const { data: songs, error: songsError } = await adminClient!
    .from(SONGS_TABLE)
    .select('id')
    .eq('user_id', auth.user.id)
    .in('id', songIds);

  if (songsError) {
    if (isOptionalTableMissingError(songsError)) {
      return NextResponse.json({ error: 'Song library tables are missing.', sql: RELEASE_SONGS_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: songsError.message || 'Could not load songs.' }, { status: 500 });
  }

  const validSongIds = new Set((songs || []).map((song) => song.id));
  const invalid = songIds.find((id: string) => !validSongIds.has(id));
  if (invalid) {
    return NextResponse.json({ error: 'One or more selected songs are unavailable.' }, { status: 400 });
  }

  const { data: existingRows } = await adminClient!
    .from(RELEASE_SONGS_TABLE)
    .select('song_id,track_number')
    .eq('release_id', planId);

  const existingIds = new Set((existingRows || []).map((row) => row.song_id));
  let nextTrackNumber = Math.max(0, ...((existingRows || []).map((row) => Number(row.track_number || 0)))) + 1;

  const rowsToInsert = songIds
    .filter((songId: string) => !existingIds.has(songId))
    .map((songId: string) => ({
      release_id: planId,
      song_id: songId,
      track_number: nextTrackNumber++,
      updated_at: new Date().toISOString(),
    }));

  if (rowsToInsert.length === 0) {
    return NextResponse.json({ status: 'unchanged' });
  }

  const { error: insertError } = await adminClient!
    .from(RELEASE_SONGS_TABLE)
    .insert(rowsToInsert);

  if (insertError) {
    if (isOptionalTableMissingError(insertError)) {
      return NextResponse.json({ error: 'Release song links table is missing.', sql: RELEASE_SONGS_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: insertError.message || 'Could not attach songs.' }, { status: 500 });
  }

  return NextResponse.json({ status: 'attached' });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ planId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { planId } = await context.params;
  if (!planId) return NextResponse.json({ error: 'Plan id is required' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, planId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const body = await request.json().catch(() => ({}));
  const orderedSongIds = Array.isArray(body?.orderedSongIds)
    ? body.orderedSongIds.map((item: unknown) => String(item || '').trim()).filter(Boolean)
    : [];

  if (orderedSongIds.length === 0) {
    return NextResponse.json({ error: 'Song order is required.' }, { status: 400 });
  }

  const { data: existingRows, error: existingError } = await adminClient!
    .from(RELEASE_SONGS_TABLE)
    .select('song_id')
    .eq('release_id', planId);

  if (existingError) {
    if (isOptionalTableMissingError(existingError)) {
      return NextResponse.json({ error: 'Release song links table is missing.', sql: RELEASE_SONGS_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: existingError.message || 'Could not update track order.' }, { status: 500 });
  }

  const currentSongIds = (existingRows || []).map((row) => String(row.song_id || ''));
  if (currentSongIds.length !== orderedSongIds.length || currentSongIds.some((id) => !orderedSongIds.includes(id))) {
    return NextResponse.json({ error: 'Track order does not match the attached songs.' }, { status: 400 });
  }

  const updates = orderedSongIds.map((songId: string, index: number) =>
    adminClient!
      .from(RELEASE_SONGS_TABLE)
      .update({
        track_number: index + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('release_id', planId)
      .eq('song_id', songId)
  );

  const results = await Promise.all(updates);
  const updateError = results.find((result) => result.error)?.error;
  if (updateError) {
    if (isOptionalTableMissingError(updateError)) {
      return NextResponse.json({ error: 'Release song links table is missing.', sql: RELEASE_SONGS_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: updateError.message || 'Could not update track order.' }, { status: 500 });
  }

  return NextResponse.json({ status: 'reordered' });
}
