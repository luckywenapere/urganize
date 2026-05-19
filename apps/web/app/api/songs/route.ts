import { NextRequest, NextResponse } from 'next/server';
import { requirePaidAccess } from '../_shared/paywall';
import {
  createAdminClient,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  SONGS_TABLE,
  SONG_CONTRIBUTORS_TABLE,
  SONG_LIBRARY_SQL,
} from './_shared';
import {
  emptySongAdministrative,
  emptySongNotes,
  emptySongPublishing,
  emptySongProduction,
  normalizeFeaturedArtists,
  normalizeSongAdministrative,
  normalizeSongContributors,
  normalizeSongFormInput,
  normalizeSongNotes,
  normalizeSongPublishing,
  normalizeSongProduction,
} from '@/lib/song-library';
import { RELEASE_SONGS_TABLE } from '@/lib/release-songs';

type ReleaseOption = {
  id: string;
  title: string;
  artist_name: string;
};

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const [{ data: songsData, error: songsError }, { data: contributorsData, error: contributorsError }, { data: releasesData, error: releasesError }] =
    await Promise.all([
      adminClient
        .from(SONGS_TABLE)
        .select('id,song_title,primary_artist,isrc,duration,project_or_release,updated_at')
        .eq('user_id', auth.user.id)
        .order('updated_at', { ascending: false }),
      adminClient
        .from(SONG_CONTRIBUTORS_TABLE)
        .select('song_id,legal_name,credited_name')
        .in(
          'song_id',
          (
            await adminClient
              .from(SONGS_TABLE)
              .select('id')
              .eq('user_id', auth.user.id)
          ).data?.map((song) => song.id) || []
        ),
      adminClient
        .from('releases')
        .select('id,title,artist_name')
        .eq('user_id', auth.user.id)
        .order('release_date', { ascending: true, nullsFirst: false }),
    ]);

  const tableError = songsError || contributorsError || releasesError;
  if (tableError) {
    if (isOptionalTableMissingError(tableError)) {
      return NextResponse.json({ error: 'Song library tables are missing.', sql: SONG_LIBRARY_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: tableError.message || 'Could not load song library.' }, { status: 500 });
  }

  const contributorNamesBySong = new Map<string, string[]>();
  for (const row of contributorsData || []) {
    const songId = String(row.song_id || '');
    const names = contributorNamesBySong.get(songId) || [];
    const displayName = String(row.credited_name || row.legal_name || '').trim();
    if (displayName) names.push(displayName);
    contributorNamesBySong.set(songId, names);
  }

  const songIds = (songsData || []).map((song) => song.id);
  const { data: releaseLinkRows, error: releaseLinkError } = songIds.length > 0
    ? await adminClient
        .from(RELEASE_SONGS_TABLE)
        .select('song_id,release_id,created_at')
        .in('song_id', songIds)
        .order('created_at', { ascending: true })
    : { data: [], error: null };

  if (releaseLinkError) {
    if (isOptionalTableMissingError(releaseLinkError)) {
      return NextResponse.json({ error: 'Song library tables are missing.', sql: SONG_LIBRARY_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: releaseLinkError.message || 'Could not load song library.' }, { status: 500 });
  }

  const releaseTitleById = new Map<string, string>();
  for (const release of releasesData || []) {
    releaseTitleById.set(release.id, release.title);
  }
  const linkedReleaseBySongId = new Map<string, string>();
  for (const row of releaseLinkRows || []) {
    const songId = String(row.song_id || '');
    if (linkedReleaseBySongId.has(songId)) continue;
    linkedReleaseBySongId.set(songId, releaseTitleById.get(String(row.release_id || '')) || '');
  }

  return NextResponse.json({
    songs: (songsData || []).map((song) => ({
      id: song.id,
      songTitle: song.song_title,
      primaryArtist: song.primary_artist,
      isrc: String(song.isrc || ''),
      duration: String(song.duration || ''),
      contributorCount: contributorNamesBySong.get(song.id)?.length || 0,
      associatedRelease: linkedReleaseBySongId.get(song.id) || String(song.project_or_release || ''),
      hasLinkedRelease: Boolean(linkedReleaseBySongId.get(song.id)),
      updatedAt: song.updated_at,
      contributorNames: contributorNamesBySong.get(song.id) || [],
    })),
    releaseOptions: (releasesData || []).map((release: ReleaseOption) => ({
      id: release.id,
      label: `${release.title} - ${release.artist_name}`,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const paywallResponse = await requirePaidAccess(auth.user.id, {
    feature: 'song_library',
    message: 'Upgrade required to add songs.',
  });
  if (paywallResponse) return paywallResponse;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const song = normalizeSongFormInput(body?.song);
  const contributors = normalizeSongContributors(body?.contributors);
  const publishing = normalizeSongPublishing(body?.publishing || emptySongPublishing);
  const production = normalizeSongProduction(body?.production || emptySongProduction);
  const administrative = normalizeSongAdministrative(body?.administrative || emptySongAdministrative);
  const notes = normalizeSongNotes(body?.notes || emptySongNotes);

  if (!song.songTitle || !song.primaryArtist) {
    return NextResponse.json({ error: 'Song title and primary artist are required.' }, { status: 400 });
  }

  const { data: insertedSong, error: songError } = await adminClient
    .from(SONGS_TABLE)
    .insert({
      user_id: auth.user.id,
      song_title: song.songTitle,
      primary_artist: song.primaryArtist,
      project_or_release: song.projectOrRelease,
      release_id: song.releaseId || null,
      featured_artists: normalizeFeaturedArtists(song.featuredArtistsText),
      isrc: song.isrc || null,
      duration: song.duration || null,
      genre: song.genre || null,
      language: song.language || null,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (songError || !insertedSong?.id) {
    if (isOptionalTableMissingError(songError)) {
      return NextResponse.json({ error: 'Song library tables are missing.', sql: SONG_LIBRARY_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: songError?.message || 'Could not create song.' }, { status: 500 });
  }

  const songId = insertedSong.id;

  const contributorRows = contributors.map((contributor) => ({
    song_id: songId,
    legal_name: contributor.legalName || contributor.creditedName,
    credited_name: contributor.creditedName || null,
    role: contributor.role,
    email: contributor.email || null,
    pro_affiliation: contributor.proAffiliation || null,
    ipi_number: contributor.ipiNumber || null,
    split_percentage: contributor.splitPercentage ? Number(contributor.splitPercentage) : null,
    notes: contributor.notes || null,
    updated_at: new Date().toISOString(),
  }));

  const writes = [
    adminClient.from('song_library_publishing').upsert({
      song_id: songId,
      songwriter: publishing.songwriter || null,
      composer: publishing.composer || null,
      publisher: publishing.publisher || null,
      pro_affiliation: publishing.proAffiliation || null,
      ipi_number: publishing.ipiNumber || null,
      ownership_split: publishing.ownershipSplit || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'song_id' }),
    adminClient.from('song_library_production').upsert({
      song_id: songId,
      producer: production.producer || null,
      mixing_engineer: production.mixingEngineer || null,
      mastering_engineer: production.masteringEngineer || null,
      recording_studio: production.recordingStudio || null,
      recording_date: production.recordingDate || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'song_id' }),
    adminClient.from('song_library_administrative').upsert({
      song_id: songId,
      copyright_owner: administrative.copyrightOwner || null,
      label: administrative.label || null,
      distributor: administrative.distributor || null,
      upc: administrative.upc || null,
      territory_restrictions: administrative.territoryRestrictions || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'song_id' }),
    adminClient.from('song_library_notes').upsert({
      song_id: songId,
      internal_notes: notes.internalNotes || null,
      additional_metadata: notes.additionalMetadata || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'song_id' }),
  ];

  if (contributorRows.length > 0) {
    writes.push(adminClient.from(SONG_CONTRIBUTORS_TABLE).insert(contributorRows));
  }

  const results = await Promise.all(writes);
  const writeError = results.find((result) => result.error)?.error;
  if (writeError) {
    if (isOptionalTableMissingError(writeError)) {
      return NextResponse.json({ error: 'Song library tables are missing.', sql: SONG_LIBRARY_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: writeError.message || 'Could not save song metadata.' }, { status: 500 });
  }

  return NextResponse.json({ songId });
}
