import { NextRequest, NextResponse } from 'next/server';
import {
  badRequest,
  createAdminClient,
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
  isOwnMusicPath,
  musicFolder,
  notFound,
  requireActiveAuthenticatedUser,
  UUID_SHAPE,
} from './_shared';
import { RELEASE_ASSETS_BUCKET } from '@/lib/asset-helpers';
import { parseDurationSeconds, validateMusicFile } from '@/lib/music/rules';
import {
  MUSIC_TRACKS_TABLE,
  OWNER_TRACK_COLUMNS,
  loadOwnerTracks,
  toOwnerTracks,
  type OwnerRow,
} from '@/lib/music/server';

const TITLE_MAX = 160;

/** The team's songs for one rollout, with their state and play counts. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return badRequest('Rollout id is required.');

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensureReleaseTeamReadAccess(adminClient, releaseId, auth.user);
  if ('error' in access) return access.error;

  const tracks = await loadOwnerTracks(adminClient, releaseId, {
    releaseDate: access.release.releaseDate,
    deletedAt: null,
  });
  if (!tracks) {
    return NextResponse.json({ error: 'Could not load the songs.' }, { status: 500 });
  }

  return NextResponse.json({
    releaseTitle: access.release.title,
    artistName: access.release.artistName,
    releaseDate: access.release.releaseDate,
    tracks,
  });
}

/**
 * Step 3: record an uploaded file as a song, as a DRAFT. Nothing is public until
 * the team publishes it (PATCH). With `replace_track_id` the file of an existing
 * song is swapped instead, keeping its title, its state and its plays, and the
 * old file is removed from storage.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return badRequest('Rollout id is required.');

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in access) return access.error;
  const release = access.release;

  const body = (await request.json().catch(() => null)) as {
    storage_path?: unknown;
    file_name?: unknown;
    file_size?: unknown;
    mime_type?: unknown;
    duration_seconds?: unknown;
    title?: unknown;
    explicit?: unknown;
    replace_track_id?: unknown;
  } | null;
  if (!body) return badRequest('JSON body is required.');

  const storagePath = typeof body.storage_path === 'string' ? body.storage_path : '';
  if (!isOwnMusicPath(releaseId, storagePath)) {
    return badRequest('That file does not belong to this rollout.');
  }
  const fileName = typeof body.file_name === 'string' ? body.file_name.trim().slice(0, 240) : '';
  if (!fileName) return badRequest('file_name is required.');
  const mimeType = typeof body.mime_type === 'string' ? body.mime_type.trim().toLowerCase() : '';
  const fileSize = Number(body.file_size);

  const check = validateMusicFile({ name: fileName, type: mimeType, size: fileSize });
  if (!check.ok) return badRequest(check.error);

  // Record only what is really in storage. A path that was signed and never
  // uploaded would otherwise become a song with nothing to play.
  const folder = musicFolder(releaseId).replace(/\/$/, '');
  const base = storagePath.slice(musicFolder(releaseId).length);
  const { data: listed, error: listError } = await adminClient.storage
    .from(RELEASE_ASSETS_BUCKET)
    .list(folder, { search: base, limit: 5 });
  if (listError || !listed?.some((entry) => entry.name === base)) {
    return badRequest('We could not find that upload. Try again.');
  }

  const duration = parseDurationSeconds(body.duration_seconds);
  const releaseForTracks = { releaseDate: release.releaseDate, deletedAt: null };

  const replaceId = typeof body.replace_track_id === 'string' ? body.replace_track_id : '';
  if (replaceId) {
    if (!UUID_SHAPE.test(replaceId)) return badRequest('That song id is not valid.');
    const { data: existing, error: existingError } = await adminClient
      .from(MUSIC_TRACKS_TABLE)
      .select('id,audio_bucket,audio_path')
      .eq('id', replaceId)
      .eq('release_id', releaseId)
      .maybeSingle();
    if (existingError) {
      return NextResponse.json({ error: 'Could not find that song.' }, { status: 500 });
    }
    if (!existing) return notFound();

    const { data: updated, error: updateError } = await adminClient
      .from(MUSIC_TRACKS_TABLE)
      .update({
        audio_bucket: RELEASE_ASSETS_BUCKET,
        audio_path: storagePath,
        audio_mime: mimeType,
        audio_bytes: Math.round(fileSize),
        file_name: fileName,
        duration_seconds: duration,
      })
      .eq('id', replaceId)
      .eq('release_id', releaseId)
      .select(OWNER_TRACK_COLUMNS)
      .single();
    if (updateError || !updated) {
      return NextResponse.json({ error: 'Could not save the new file.' }, { status: 500 });
    }

    // The new file is saved; the old one is no use to anyone. Best effort.
    await adminClient.storage
      .from(existing.audio_bucket || RELEASE_ASSETS_BUCKET)
      .remove([existing.audio_path as string])
      .catch(() => undefined);

    const [track] = await toOwnerTracks(adminClient, [updated as unknown as OwnerRow], releaseForTracks);
    return NextResponse.json({ track });
  }

  const title =
    typeof body.title === 'string' && body.title.trim()
      ? body.title.trim().slice(0, TITLE_MAX)
      : release.title.trim().slice(0, TITLE_MAX) || 'Untitled song';

  const { data: inserted, error: insertError } = await adminClient
    .from(MUSIC_TRACKS_TABLE)
    .insert({
      release_id: releaseId,
      // The ROLLOUT owner, not the teammate who clicked: the song must outlive
      // whoever happened to upload it.
      owner_user_id: release.ownerUserId,
      artist_id: release.artistId || null,
      title,
      artist_name: release.artistName.trim().slice(0, 160) || 'Unknown artist',
      explicit: body.explicit === true,
      audio_bucket: RELEASE_ASSETS_BUCKET,
      audio_path: storagePath,
      audio_mime: mimeType,
      audio_bytes: Math.round(fileSize),
      file_name: fileName,
      duration_seconds: duration,
      created_by: auth.user.id,
    })
    .select(OWNER_TRACK_COLUMNS)
    .single();
  if (insertError || !inserted) {
    return NextResponse.json(
      { error: 'The song uploaded but we could not save it. Try again.' },
      { status: 500 }
    );
  }

  const [track] = await toOwnerTracks(adminClient, [inserted as unknown as OwnerRow], releaseForTracks);
  return NextResponse.json({ track }, { status: 201 });
}
