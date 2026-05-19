import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  ensureSongOwnership,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  SONGS_TABLE,
  SONG_CONTRIBUTORS_TABLE,
  SONG_PUBLISHING_TABLE,
  SONG_PRODUCTION_TABLE,
  SONG_ADMINISTRATIVE_TABLE,
  SONG_NOTES_TABLE,
  SONG_LIBRARY_SQL,
} from '../_shared';
import {
  normalizeFeaturedArtists,
  normalizeSongAdministrative,
  normalizeSongContributors,
  normalizeSongFormInput,
  normalizeSongNotes,
  normalizeSongPublishing,
  normalizeSongProduction,
  type SongContributor,
} from '@/lib/song-library';
import { RELEASE_SONGS_TABLE } from '@/lib/release-songs';

type ReleaseOption = {
  id: string;
  title: string;
  artist_name: string;
};

const toSongResponse = (row: Record<string, unknown>) => ({
  id: String(row?.id || ''),
  userId: String(row?.user_id || ''),
  songTitle: String(row?.song_title || ''),
  primaryArtist: String(row?.primary_artist || ''),
  projectOrRelease: String(row?.project_or_release || ''),
  releaseId: String(row?.release_id || ''),
  featuredArtists: Array.isArray(row?.featured_artists) ? row.featured_artists.map((item: unknown) => String(item || '')) : [],
  isrc: String(row?.isrc || ''),
  duration: String(row?.duration || ''),
  genre: String(row?.genre || ''),
  language: String(row?.language || ''),
  createdAt: String(row?.created_at || ''),
  updatedAt: String(row?.updated_at || ''),
});

const toContributorResponse = (row: Record<string, unknown>): SongContributor => ({
  id: String(row?.id || ''),
  songId: String(row?.song_id || ''),
  legalName: String(row?.legal_name || ''),
  creditedName: String(row?.credited_name || ''),
  role: (row?.role as SongContributor['role'] | undefined) || 'Other',
  email: String(row?.email || ''),
  proAffiliation: String(row?.pro_affiliation || ''),
  ipiNumber: String(row?.ipi_number || ''),
  splitPercentage: row?.split_percentage == null ? '' : String(row.split_percentage),
  notes: String(row?.notes || ''),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ songId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { songId } = await context.params;
  if (!songId) return NextResponse.json({ error: 'Song id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureSongOwnership(adminClient, songId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const [{ data: songRow, error: songError }, { data: contributorRows, error: contributorError }, { data: publishingRow, error: publishingError }, { data: productionRow, error: productionError }, { data: administrativeRow, error: administrativeError }, { data: notesRow, error: notesError }, { data: releasesData, error: releasesError }] =
    await Promise.all([
      adminClient!.from(SONGS_TABLE).select('*').eq('id', songId).single(),
      adminClient!.from(SONG_CONTRIBUTORS_TABLE).select('*').eq('song_id', songId).order('created_at', { ascending: true }),
      adminClient!.from(SONG_PUBLISHING_TABLE).select('*').eq('song_id', songId).maybeSingle(),
      adminClient!.from(SONG_PRODUCTION_TABLE).select('*').eq('song_id', songId).maybeSingle(),
      adminClient!.from(SONG_ADMINISTRATIVE_TABLE).select('*').eq('song_id', songId).maybeSingle(),
      adminClient!.from(SONG_NOTES_TABLE).select('*').eq('song_id', songId).maybeSingle(),
      adminClient!
        .from('releases')
        .select('id,title,artist_name')
        .eq('user_id', auth.user.id)
        .order('release_date', { ascending: true, nullsFirst: false }),
    ]);

  const error = songError || contributorError || publishingError || productionError || administrativeError || notesError || releasesError;
  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json({ error: 'Song library tables are missing.', sql: SONG_LIBRARY_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: error.message || 'Could not load song metadata.' }, { status: 500 });
  }

  const { data: releaseLinkRows, error: releaseLinkError } = await adminClient!
    .from(RELEASE_SONGS_TABLE)
    .select('release_id,created_at')
    .eq('song_id', songId)
    .order('created_at', { ascending: true });

  if (releaseLinkError) {
    if (isOptionalTableMissingError(releaseLinkError)) {
      return NextResponse.json({ error: 'Song library tables are missing.', sql: SONG_LIBRARY_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: releaseLinkError.message || 'Could not load song metadata.' }, { status: 500 });
  }

  const linkedReleaseIds = (releaseLinkRows || []).map((row) => String(row.release_id || ''));
  const linkedReleaseOptions = (releasesData || []).filter((release: ReleaseOption) => linkedReleaseIds.includes(release.id));

  return NextResponse.json({
    detail: {
      song: toSongResponse(songRow),
      contributors: (contributorRows || []).map((row) => toContributorResponse(row)),
      publishing: normalizeSongPublishing({
        songwriter: publishingRow?.songwriter,
        composer: publishingRow?.composer,
        publisher: publishingRow?.publisher,
        proAffiliation: publishingRow?.pro_affiliation,
        ipiNumber: publishingRow?.ipi_number,
        ownershipSplit: publishingRow?.ownership_split,
      }),
      production: normalizeSongProduction({
        producer: productionRow?.producer,
        mixingEngineer: productionRow?.mixing_engineer,
        masteringEngineer: productionRow?.mastering_engineer,
        recordingStudio: productionRow?.recording_studio,
        recordingDate: productionRow?.recording_date,
      }),
      administrative: normalizeSongAdministrative({
        copyrightOwner: administrativeRow?.copyright_owner,
        label: administrativeRow?.label,
        distributor: administrativeRow?.distributor,
        upc: administrativeRow?.upc,
        territoryRestrictions: administrativeRow?.territory_restrictions,
      }),
      notes: normalizeSongNotes({
        internalNotes: notesRow?.internal_notes,
        additionalMetadata: notesRow?.additional_metadata,
      }),
      linkedReleases: linkedReleaseOptions.map((release) => ({
        id: release.id,
        title: release.title,
        label: `${release.title} - ${release.artist_name}`,
      })),
    },
    releaseOptions: (releasesData || []).map((release: ReleaseOption) => ({
      id: release.id,
      label: `${release.title} - ${release.artist_name}`,
    })),
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ songId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { songId } = await context.params;
  if (!songId) return NextResponse.json({ error: 'Song id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureSongOwnership(adminClient, songId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const body = await request.json().catch(() => ({}));
  const song = normalizeSongFormInput(body?.song);
  const contributors = normalizeSongContributors(body?.contributors);
  const publishing = normalizeSongPublishing(body?.publishing);
  const production = normalizeSongProduction(body?.production);
  const administrative = normalizeSongAdministrative(body?.administrative);
  const notes = normalizeSongNotes(body?.notes);

  if (!song.songTitle || !song.primaryArtist) {
    return NextResponse.json({ error: 'Song title and primary artist are required.' }, { status: 400 });
  }

  const { error: songError } = await adminClient!
    .from(SONGS_TABLE)
    .update({
      song_title: song.songTitle,
      primary_artist: song.primaryArtist,
      project_or_release: song.projectOrRelease || null,
      release_id: song.releaseId || null,
      featured_artists: normalizeFeaturedArtists(song.featuredArtistsText),
      isrc: song.isrc || null,
      duration: song.duration || null,
      genre: song.genre || null,
      language: song.language || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', songId)
    .eq('user_id', auth.user.id);

  if (songError) {
    if (isOptionalTableMissingError(songError)) {
      return NextResponse.json({ error: 'Song library tables are missing.', sql: SONG_LIBRARY_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: songError.message || 'Could not update song.' }, { status: 500 });
  }

  const contributorRows = contributors.map((contributor) => ({
    id: contributor.id || undefined,
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

  const writes = await Promise.all([
    adminClient!.from(SONG_PUBLISHING_TABLE).upsert({
      song_id: songId,
      songwriter: publishing.songwriter || null,
      composer: publishing.composer || null,
      publisher: publishing.publisher || null,
      pro_affiliation: publishing.proAffiliation || null,
      ipi_number: publishing.ipiNumber || null,
      ownership_split: publishing.ownershipSplit || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'song_id' }),
    adminClient!.from(SONG_PRODUCTION_TABLE).upsert({
      song_id: songId,
      producer: production.producer || null,
      mixing_engineer: production.mixingEngineer || null,
      mastering_engineer: production.masteringEngineer || null,
      recording_studio: production.recordingStudio || null,
      recording_date: production.recordingDate || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'song_id' }),
    adminClient!.from(SONG_ADMINISTRATIVE_TABLE).upsert({
      song_id: songId,
      copyright_owner: administrative.copyrightOwner || null,
      label: administrative.label || null,
      distributor: administrative.distributor || null,
      upc: administrative.upc || null,
      territory_restrictions: administrative.territoryRestrictions || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'song_id' }),
    adminClient!.from(SONG_NOTES_TABLE).upsert({
      song_id: songId,
      internal_notes: notes.internalNotes || null,
      additional_metadata: notes.additionalMetadata || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'song_id' }),
  ]);

  const writeError = writes.find((result) => result.error)?.error;
  if (writeError) {
    if (isOptionalTableMissingError(writeError)) {
      return NextResponse.json({ error: 'Song library tables are missing.', sql: SONG_LIBRARY_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: writeError.message || 'Could not update song metadata.' }, { status: 500 });
  }

  const { error: deleteContributorsError } = await adminClient!
    .from(SONG_CONTRIBUTORS_TABLE)
    .delete()
    .eq('song_id', songId);

  if (deleteContributorsError) {
    if (isOptionalTableMissingError(deleteContributorsError)) {
      return NextResponse.json({ error: 'Song library tables are missing.', sql: SONG_LIBRARY_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: deleteContributorsError.message || 'Could not update contributors.' }, { status: 500 });
  }

  if (contributorRows.length > 0) {
    const { error: contributorError } = await adminClient!
      .from(SONG_CONTRIBUTORS_TABLE)
      .insert(contributorRows);

    if (contributorError) {
      if (isOptionalTableMissingError(contributorError)) {
        return NextResponse.json({ error: 'Song library tables are missing.', sql: SONG_LIBRARY_SQL }, { status: 501 });
      }
      return NextResponse.json({ error: contributorError.message || 'Could not save contributors.' }, { status: 500 });
    }
  }

  return NextResponse.json({ status: 'saved' });
}
