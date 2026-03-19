import { NextRequest, NextResponse } from 'next/server';
import {
  ARTISTS_TABLE,
  RELEASE_EVENTS_TABLE,
  RELEASE_METADATA_TABLE,
  buildMissingTableResponse,
  createAdminClient,
  ensureReleaseOpsSchema,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  loadReleaseCommandCenterData,
} from './_shared';
import { normalizeReleaseSlug } from '@/lib/release-ops';

const trimString = (value: unknown): string => String(value || '').trim();

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const releasesResult = await adminClient
    .from('releases')
    .select('id,user_id,owner_user_id,artist_id,artist_name,title,slug,release_date,status,description,created_at,updated_at')
    .or(`owner_user_id.eq.${auth.user.id},user_id.eq.${auth.user.id}`)
    .order('release_date', { ascending: true, nullsFirst: false });

  if (releasesResult.error) {
    if (isOptionalTableMissingError(releasesResult.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: releasesResult.error.message || 'Could not load releases.' }, { status: 500 });
  }

  const releases = Array.isArray(releasesResult.data) ? releasesResult.data : [];
  const summaries = await Promise.all(
    releases.map(async (row) => {
      const release = {
        id: String(row.id || ''),
        ownerUserId: String(row.owner_user_id || row.user_id || ''),
        artistId: String(row.artist_id || ''),
        artistName: String(row.artist_name || ''),
        title: String(row.title || ''),
        slug: String(row.slug || ''),
        releaseDate: String(row.release_date || ''),
        status: String(row.status || 'draft') as 'draft' | 'in_progress' | 'ready',
        description: String(row.description || ''),
        createdAt: String(row.created_at || ''),
        updatedAt: String(row.updated_at || ''),
      };

      const commandCenter = await loadReleaseCommandCenterData(adminClient, release);
      if ('error' in commandCenter) {
        return {
          id: release.id,
          title: release.title,
          artistName: release.artistName,
          status: release.status,
          progress: 0,
          invitedCount: 0,
          submittedCount: 0,
          pendingCount: 0,
        };
      }

      const computedStatus = commandCenter.readiness.readyForDistribution
        ? 'ready'
        : commandCenter.collaborators.length > 0
          ? 'in_progress'
          : 'draft';

      return {
        id: release.id,
        title: release.title,
        artistName: release.artistName,
        releaseDate: release.releaseDate,
        status: computedStatus,
        progress: commandCenter.readiness.completionPercent,
        invitedCount: commandCenter.collaborators.length,
        submittedCount: commandCenter.readiness.submittedCollaborators,
        pendingCount: commandCenter.readiness.pendingCollaborators,
      };
    })
  );

  return NextResponse.json({ releases: summaries });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const schemaStatus = await ensureReleaseOpsSchema(adminClient);
  if ('error' in schemaStatus) return schemaStatus.error;

  const body = await request.json().catch(() => ({}));
  const artistId = trimString(body?.artistId);
  const artistNameInput = trimString(body?.artistName);
  const title = trimString(body?.title);
  const releaseDate = trimString(body?.releaseDate);
  const description = trimString(body?.description);
  const releaseType = trimString(body?.releaseType) || 'single';

  if (!title) return NextResponse.json({ error: 'Release title is required.' }, { status: 400 });
  if (!releaseDate) return NextResponse.json({ error: 'Release date is required.' }, { status: 400 });

  let artistIdToUse = artistId;
  let artistName = artistNameInput;

  if (artistIdToUse) {
    const artistResult = await adminClient
      .from(ARTISTS_TABLE)
      .select('id,name')
      .eq('id', artistIdToUse)
      .eq('owner_user_id', auth.user.id)
      .maybeSingle();

    if (artistResult.error) {
      if (isOptionalTableMissingError(artistResult.error)) {
        return buildMissingTableResponse('Artist lookup failed because the artists schema is incomplete.');
      }
      return NextResponse.json({ error: artistResult.error.message || 'Could not load artist.' }, { status: 500 });
    }

    if (!artistResult.data) {
      return NextResponse.json({ error: 'Artist not found.' }, { status: 404 });
    }

    artistName = String(artistResult.data.name || '');
  } else if (artistName) {
    const normalizedSlug = normalizeReleaseSlug(artistName);
    const existingArtistResult = await adminClient
      .from(ARTISTS_TABLE)
      .select('id,name')
      .eq('owner_user_id', auth.user.id)
      .eq('slug', normalizedSlug)
      .maybeSingle();

    if (existingArtistResult.error && !isOptionalTableMissingError(existingArtistResult.error)) {
      return NextResponse.json({ error: existingArtistResult.error.message || 'Could not load artist.' }, { status: 500 });
    }
    if (existingArtistResult.error && isOptionalTableMissingError(existingArtistResult.error)) {
      return buildMissingTableResponse('Artist lookup failed because the artists schema is incomplete.');
    }

    if (existingArtistResult.data?.id) {
      artistIdToUse = String(existingArtistResult.data.id);
      artistName = String(existingArtistResult.data.name || artistName);
    } else {
      const insertArtistResult = await adminClient
        .from(ARTISTS_TABLE)
        .insert({
          owner_user_id: auth.user.id,
          name: artistName,
          slug: normalizedSlug || `artist-${Date.now()}`,
          updated_at: new Date().toISOString(),
        })
        .select('id,name')
        .single();

      if (insertArtistResult.error) {
        if (isOptionalTableMissingError(insertArtistResult.error)) {
          return buildMissingTableResponse('Artist creation failed because the artists schema is incomplete.');
        }
        return NextResponse.json({ error: insertArtistResult.error.message || 'Could not create artist.' }, { status: 500 });
      }

      artistIdToUse = String(insertArtistResult.data.id || '');
      artistName = String(insertArtistResult.data.name || artistName);
    }
  }

  if (!artistName) {
    return NextResponse.json({ error: 'Artist name is required.' }, { status: 400 });
  }

  const slug = normalizeReleaseSlug(title) || `release-${Date.now()}`;
  const now = new Date().toISOString();

  const releaseResult = await adminClient
    .from('releases')
    .insert({
      user_id: auth.user.id,
      owner_user_id: auth.user.id,
      artist_id: artistIdToUse || null,
      artist_name: artistName,
      title,
      slug,
      release_date: releaseDate,
      status: 'draft',
      type: releaseType,
      description: description || null,
      updated_at: now,
    })
    .select('id,status')
    .single();

  if (releaseResult.error || !releaseResult.data?.id) {
    if (isOptionalTableMissingError(releaseResult.error)) {
      return buildMissingTableResponse('Release creation failed because the releases schema is incomplete.');
    }
    return NextResponse.json({ error: releaseResult.error?.message || 'Could not create release.' }, { status: 500 });
  }

  const releaseId = String(releaseResult.data.id);

  const metadataResult = await adminClient
    .from(RELEASE_METADATA_TABLE)
    .insert({
      release_id: releaseId,
      primary_artist_name: artistName,
      release_title: title,
      updated_at: now,
    })
    .select('id')
    .single();

  if (metadataResult.error) {
    if (isOptionalTableMissingError(metadataResult.error)) {
      return buildMissingTableResponse('Metadata initialization failed because the metadata schema is incomplete.');
    }
    return NextResponse.json({ error: metadataResult.error.message || 'Could not initialize metadata.' }, { status: 500 });
  }

  const eventResult = await adminClient.from(RELEASE_EVENTS_TABLE).insert({
    release_id: releaseId,
    type: 'release_created',
    payload_json: {
      title,
      artistName,
    },
  });

  if (eventResult.error) {
    if (isOptionalTableMissingError(eventResult.error)) {
      return buildMissingTableResponse('Release event logging failed because the events schema is incomplete.');
    }
    return NextResponse.json({ error: eventResult.error.message || 'Could not log release event.' }, { status: 500 });
  }

  return NextResponse.json({
    releaseId,
    status: String(releaseResult.data.status || 'draft'),
  });
}
