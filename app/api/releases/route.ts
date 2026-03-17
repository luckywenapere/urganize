import { NextRequest, NextResponse } from 'next/server';
import {
  ARTISTS_TABLE,
  RELEASE_EVENTS_TABLE,
  RELEASE_METADATA_TABLE,
  buildMissingTableResponse,
  createAdminClient,
  getAuthenticatedUser,
  isOptionalTableMissingError,
} from './_shared';
import { normalizeReleaseSlug } from '@/lib/release-ops';

const trimString = (value: unknown): string => String(value || '').trim();

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const artistId = trimString(body?.artistId);
  const artistNameInput = trimString(body?.artistName);
  const title = trimString(body?.title);
  const releaseDate = trimString(body?.releaseDate);
  const description = trimString(body?.description);

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
      if (isOptionalTableMissingError(artistResult.error)) return buildMissingTableResponse();
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
      return buildMissingTableResponse();
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
        if (isOptionalTableMissingError(insertArtistResult.error)) return buildMissingTableResponse();
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
      description: description || null,
      updated_at: now,
    })
    .select('id,status')
    .single();

  if (releaseResult.error || !releaseResult.data?.id) {
    if (isOptionalTableMissingError(releaseResult.error)) return buildMissingTableResponse();
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
    if (isOptionalTableMissingError(metadataResult.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: metadataResult.error.message || 'Could not initialize metadata.' }, { status: 500 });
  }

  const eventResult = await adminClient.from(RELEASE_EVENTS_TABLE).insert({
    release_id: releaseId,
    type: 'release_created',
    payload_json: {
      title,
      artistName,
      releaseDate,
    },
  });

  if (eventResult.error) {
    if (isOptionalTableMissingError(eventResult.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: eventResult.error.message || 'Could not log release event.' }, { status: 500 });
  }

  return NextResponse.json({
    releaseId,
    status: String(releaseResult.data.status || 'draft'),
  });
}
