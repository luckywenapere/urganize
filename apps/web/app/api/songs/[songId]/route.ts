import { NextRequest, NextResponse } from 'next/server';
import { describeSongInUse, parseSongPatch } from '@/lib/song-catalog';
import {
  EVENTS_TABLE,
  SETLISTS_TABLE,
  SETLIST_ITEMS_TABLE,
  SONGS_TABLE,
  SONG_COLUMNS,
  SONG_VERSIONS_TABLE,
  asRow,
  createAdminClient,
  ensureSongAccess,
  eventsDisabledResponse,
  isEventsFeatureEnabled,
  requireActiveAuthenticatedUser,
  toSong,
} from '@/app/api/events/_shared';

type Params = { params: Promise<{ songId: string }> };

/**
 * PATCH /api/songs/[songId] — fix a song's title, length, BPM or key.
 *
 * There was no way to edit a song at all before 2026-09-25, so a typo in a
 * title was permanent and followed the song into every set and every DJ's
 * file names. Sparse, like every other Shows patch; parseSongPatch is the one
 * definition of a valid song, shared with POST /api/songs.
 *
 * A song is catalog, not a show detail: the change reaches every set that
 * plays it, and the set builder says so where it offers the edit.
 */
export async function PATCH(request: NextRequest, context: Params) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { songId } = await context.params;
  if (!songId) {
    return NextResponse.json({ error: 'A song id is required.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Send what changed.' }, { status: 400 });
  }

  const parsed = parseSongPatch(body);
  if (parsed.errors.length > 0) {
    return NextResponse.json(
      { error: parsed.errors[0].message, fieldErrors: parsed.errors },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureSongAccess(adminClient, songId, auth.user, true);
  if ('error' in access) return access.error;

  const { data, error } = await adminClient!
    .from(SONGS_TABLE)
    .update(parsed.columns)
    .eq('id', songId)
    .select(SONG_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Could not save the song.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ song: toSong(asRow(data)) });
}

/**
 * DELETE /api/songs/[songId] — remove a song and its files from the catalog.
 *
 * Refused while any set plays it. setlist_items.song_id is ON DELETE RESTRICT
 * on purpose: deleting a song must never silently shorten a set or change its
 * running total. So the refusal names the shows it is in (describeSongInUse)
 * instead of surfacing a foreign-key error.
 *
 * Files are removed from storage first, then the row (its file rows cascade).
 * The storage step is best-effort: a stranded object costs storage, while
 * refusing to remove a song the manager asked to remove would leave it in
 * their catalog for good.
 */
export async function DELETE(request: NextRequest, context: Params) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { songId } = await context.params;
  if (!songId) {
    return NextResponse.json({ error: 'A song id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureSongAccess(adminClient, songId, auth.user, true);
  if ('error' in access) return access.error;

  const uses = await adminClient!
    .from(SETLIST_ITEMS_TABLE)
    .select('setlist_id')
    .eq('song_id', songId);
  if (uses.error) {
    return NextResponse.json(
      { error: uses.error.message || 'Could not check where this song is used.' },
      { status: 500 }
    );
  }

  const setlistIds = [...new Set((uses.data || []).map((row) => String(asRow(row).setlist_id || '')))]
    .filter(Boolean);
  if (setlistIds.length > 0) {
    // Name the shows, best-effort: a failed lookup still refuses, just with the
    // general sentence.
    let showTitles: string[] = [];
    const sets = await adminClient!.from(SETLISTS_TABLE).select('event_id').in('id', setlistIds);
    const eventIds = [...new Set((sets.data || []).map((row) => String(asRow(row).event_id || '')))]
      .filter(Boolean);
    if (eventIds.length > 0) {
      const shows = await adminClient!.from(EVENTS_TABLE).select('title').in('id', eventIds);
      showTitles = (shows.data || []).map((row) => String(asRow(row).title || ''));
    }
    return NextResponse.json(
      { error: describeSongInUse(showTitles), code: 'song_in_use' },
      { status: 409 }
    );
  }

  const files = await adminClient!
    .from(SONG_VERSIONS_TABLE)
    .select('storage_bucket,storage_path')
    .eq('song_id', songId);
  const byBucket = new Map<string, string[]>();
  for (const row of files.data || []) {
    const file = asRow(row);
    const bucket = String(file.storage_bucket || '');
    const path = String(file.storage_path || '');
    if (!bucket || !path) continue;
    byBucket.set(bucket, [...(byBucket.get(bucket) || []), path]);
  }
  for (const [bucket, paths] of byBucket) {
    const removal = await adminClient!.storage.from(bucket).remove(paths);
    if (removal.error) {
      console.error('[songs] storage removal failed', { songId, message: removal.error.message });
    }
  }

  const { error } = await adminClient!.from(SONGS_TABLE).delete().eq('id', songId);
  if (error) {
    // A set picked the song up between the check and the delete.
    if (error.code === '23503') {
      return NextResponse.json(
        { error: describeSongInUse([]), code: 'song_in_use' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Could not delete the song.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ deleted: true });
}
