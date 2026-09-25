import { NextRequest, NextResponse } from 'next/server';
import { isKnownVersionLabel } from '@/lib/song-versions';
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

/**
 * PATCH — change which version a file is (Clean, Radio edit…).
 *
 * The label is guessed from the file name on upload, and a guess can be wrong;
 * it is also what a DJ reads to know which file to play, so it has to be
 * fixable without re-uploading the file.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ songId: string; versionId: string }> }
) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { songId, versionId } = await context.params;
  if (!songId || !versionId) {
    return NextResponse.json({ error: 'A song and a file are required.' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isKnownVersionLabel(body.label)) {
    return NextResponse.json({ error: 'Pick which version this file is.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureSongAccess(adminClient, songId, auth.user, true);
  if ('error' in access) return access.error;

  const { data, error } = await adminClient!
    .from(SONG_VERSIONS_TABLE)
    .update({ label: body.label })
    .eq('id', versionId)
    .eq('song_id', songId)
    .select(SONG_VERSION_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not save that.' },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: 'That file is not on this song.' }, { status: 404 });
  }

  const row = asRow(data);
  return NextResponse.json({
    version: {
      id: String(row.id || ''),
      songId: String(row.song_id || ''),
      label: String(row.label || 'original'),
      fileName: String(row.file_name || ''),
    },
  });
}

/**
 * Remove one file from a song.
 *
 * Storage object first, then the row — the single-asset DELETE route's order.
 * An orphaned object is recoverable; a row pointing at nothing is harder to
 * notice, because it renders as a track that silently fails to play.
 *
 * A setlist item referencing this version is left alone: song_version_id is
 * ON DELETE SET NULL, so the item stays as a real "play this song" slot that
 * simply needs a version picked again.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ songId: string; versionId: string }> }
) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { songId, versionId } = await context.params;
  if (!songId || !versionId) {
    return NextResponse.json({ error: 'A song and a file are required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureSongAccess(adminClient, songId, auth.user, true);
  if ('error' in access) return access.error;

  // Scoped to the song in the URL, so a version id from another song cannot be
  // deleted through a song you happen to own.
  const existing = await adminClient!
    .from(SONG_VERSIONS_TABLE)
    .select('id,storage_bucket,storage_path')
    .eq('id', versionId)
    .eq('song_id', songId)
    .maybeSingle();

  if (existing.error) {
    return NextResponse.json(
      { error: existing.error.message || 'Could not load that file.' },
      { status: 500 }
    );
  }
  if (!existing.data) {
    return NextResponse.json({ error: 'That file is not on this song.' }, { status: 404 });
  }

  const row = asRow(existing.data);
  const bucket = String(row.storage_bucket || '');
  const path = String(row.storage_path || '');

  if (bucket && path) {
    const removal = await adminClient!.storage.from(bucket).remove([path]);
    if (removal.error) {
      // Best-effort: a stranded object costs storage, while refusing to remove
      // the row would leave a track in the pack that the manager just told us
      // to take out.
      console.error('[song-versions] storage removal failed', {
        versionId,
        message: removal.error.message,
      });
    }
  }

  const { error } = await adminClient!
    .from(SONG_VERSIONS_TABLE)
    .delete()
    .eq('id', versionId)
    .eq('song_id', songId);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not remove that file.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ deleted: true });
}
