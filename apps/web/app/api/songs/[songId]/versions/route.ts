import { NextRequest, NextResponse } from 'next/server';
import { RELEASE_ASSETS_BUCKET } from '@/lib/asset-helpers';
import { isKnownVersionLabel, validateSongVersionUpload } from '@/lib/song-versions';
import {
  SONG_VERSIONS_TABLE,
  SONG_VERSION_COLUMNS,
  asRow,
  createAdminClient,
  ensureSongAccess,
  eventsDisabledResponse,
  isEventsFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '@/app/api/events/_shared';

const toVersion = (row: Record<string, unknown>) => ({
  id: String(row.id || ''),
  songId: String(row.song_id || ''),
  label: String(row.label || 'original'),
  fileName: String(row.file_name || ''),
  fileSize: typeof row.file_size === 'number' ? row.file_size : 0,
  mimeType: row.mime_type ? String(row.mime_type) : null,
  durationSeconds:
    typeof row.duration_seconds === 'number' && row.duration_seconds > 0
      ? row.duration_seconds
      : null,
  createdAt: String(row.created_at || ''),
});

/** Every file attached to this song, newest first. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ songId: string }> }
) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { songId } = await context.params;
  if (!songId) {
    return NextResponse.json({ error: 'A song id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureSongAccess(adminClient, songId, auth.user, false);
  if ('error' in access) return access.error;

  const { data, error } = await adminClient!
    .from(SONG_VERSIONS_TABLE)
    .select(SONG_VERSION_COLUMNS)
    .eq('song_id', songId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not load the files.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ versions: (data || []).map((row) => toVersion(asRow(row))) });
}

/**
 * Step three of three: record the file the browser just uploaded.
 *
 * Verifies the object actually landed under this song's own prefix before
 * pointing a row at it, so a signed URL minted for one song cannot be used to
 * attach a file to another (the workspace-logo route's check).
 *
 * A song can hold several versions and adding one NEVER replaces another — a
 * clean and a dirty are both real, and a DJ needs to be handed the right one.
 * That is the opposite of the cover-art rule, where a release has exactly one
 * identity image.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ songId: string }> }
) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { songId } = await context.params;
  if (!songId) {
    return NextResponse.json({ error: 'A song id is required.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Send the file details.' }, { status: 400 });
  }

  const storagePath = typeof body.storagePath === 'string' ? body.storagePath : '';
  const fileName = typeof body.fileName === 'string' ? body.fileName : '';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
  const fileSize = typeof body.fileSize === 'number' ? body.fileSize : 0;

  const invalid = validateSongVersionUpload({ fileName, mimeType, fileSize });
  if (invalid) {
    return NextResponse.json({ error: invalid.message }, { status: invalid.status });
  }

  // The path is supplied by the client, so it is checked rather than trusted.
  if (!storagePath.startsWith(`song/${songId}/`)) {
    return NextResponse.json({ error: 'That upload does not belong to this song.' }, { status: 400 });
  }

  const label = isKnownVersionLabel(body.label) ? body.label : 'original';
  const durationSeconds =
    typeof body.durationSeconds === 'number' &&
    Number.isInteger(body.durationSeconds) &&
    body.durationSeconds > 0
      ? body.durationSeconds
      : null;

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureSongAccess(adminClient, songId, auth.user, true);
  if ('error' in access) return access.error;

  const { data, error } = await adminClient!
    .from(SONG_VERSIONS_TABLE)
    .insert({
      song_id: songId,
      // Stamped with the SONG's owner, never the acting teammate — the rule
      // every row in this feature follows.
      owner_user_id: access.ownerUserId,
      label,
      file_name: fileName,
      file_size: fileSize,
      mime_type: mimeType,
      storage_bucket: RELEASE_ASSETS_BUCKET,
      storage_path: storagePath,
      duration_seconds: durationSeconds,
    })
    .select(SONG_VERSION_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Could not save the file.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ version: toVersion(asRow(data)) }, { status: 201 });
}
