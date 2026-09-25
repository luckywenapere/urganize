import { NextRequest, NextResponse } from 'next/server';
import { parseSetlistItemPatch, type SetlistItemType } from '@/lib/setlist';
import {
  SETLIST_ITEMS_TABLE,
  SETLIST_ITEM_COLUMNS,
  SONGS_TABLE,
  asRow,
  createAdminClient,
  ensureSetlistAccess,
  eventsDisabledResponse,
  isEventsFeatureEnabled,
  requireActiveAuthenticatedUser,
  versionBelongsToSong,
} from '@/app/api/events/_shared';

const ITEM_NOT_FOUND = 'That is not in this set.';

/** Loads the item and confirms it belongs to the setlist in the URL, so an id
 *  from another set cannot be edited through a set you do happen to own. */
async function loadItem(
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
  setlistId: string,
  itemId: string
) {
  const { data, error } = await adminClient
    .from(SETLIST_ITEMS_TABLE)
    .select(SETLIST_ITEM_COLUMNS)
    .eq('id', itemId)
    .eq('setlist_id', setlistId)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load that item.' },
        { status: 500 }
      ),
    };
  }
  if (!data) {
    return { error: NextResponse.json({ error: ITEM_NOT_FOUND }, { status: 404 }) };
  }
  return { item: asRow(data) };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ setlistId: string; itemId: string }> }
) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { setlistId, itemId } = await context.params;
  if (!setlistId || !itemId) {
    return NextResponse.json({ error: 'A set and an item are required.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Send what changed.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureSetlistAccess(adminClient, setlistId, auth.user, true);
  if ('error' in access) return access.error;

  const existing = await loadItem(adminClient!, setlistId, itemId);
  if ('error' in existing) return existing.error;

  // The stored type is required: the song-shape rule spans fields, so a patch
  // that turns a song slot into a break has to know what it is turning from.
  const currentType = String(existing.item.item_type || 'song') as SetlistItemType;
  const storedSeconds = existing.item.duration_seconds;
  const parsed = parseSetlistItemPatch(
    body,
    currentType,
    typeof storedSeconds === 'number' ? storedSeconds : null
  );
  if (parsed.errors.length > 0) {
    return NextResponse.json(
      { error: parsed.errors[0].message, fieldErrors: parsed.errors },
      { status: 400 }
    );
  }

  const columns = { ...parsed.columns };
  const previousSongId = existing.item.song_id ? String(existing.item.song_id) : null;
  const nextSongId =
    columns.song_id === undefined ? previousSongId : columns.song_id ?? null;

  // Swapping the song has to stay inside THIS artist's catalog, the same check
  // POST makes. It was missing here, so a patch could point a row at any song
  // id at all.
  if (columns.song_id && columns.song_id !== previousSongId) {
    const song = await adminClient!
      .from(SONGS_TABLE)
      .select('id,artist_id')
      .eq('id', columns.song_id)
      .maybeSingle();
    const songRow = song.data ? asRow(song.data) : null;
    if (!songRow || String(songRow.artist_id || '') !== access.artistId) {
      return NextResponse.json(
        { error: 'That song is not in this artist’s catalog.' },
        { status: 404 }
      );
    }
    // The file chosen for the OLD song is not a file of the new one. Unless
    // this same patch picks a new file, the row falls back to the new song's
    // own default (see pickDefaultVersion).
    if (columns.song_version_id === undefined) {
      columns.song_version_id = null;
    }
  }

  // A chosen file must be one of the row's song's files — POST's rule.
  if (columns.song_version_id) {
    const owned = await versionBelongsToSong(adminClient!, columns.song_version_id, nextSongId);
    if (!owned) {
      return NextResponse.json({ error: 'That file is not on this song.' }, { status: 404 });
    }
  }

  const { data, error } = await adminClient!
    .from(SETLIST_ITEMS_TABLE)
    .update(columns)
    .eq('id', itemId)
    .eq('setlist_id', setlistId)
    .select(SETLIST_ITEM_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Could not save that item.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ item: asRow(data) });
}

/** Removes one item. The remaining positions are left as they are — they only
 *  need to be increasing, not contiguous, and a reorder rewrites them all
 *  anyway. */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ setlistId: string; itemId: string }> }
) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { setlistId, itemId } = await context.params;
  if (!setlistId || !itemId) {
    return NextResponse.json({ error: 'A set and an item are required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureSetlistAccess(adminClient, setlistId, auth.user, true);
  if ('error' in access) return access.error;

  const { error } = await adminClient!
    .from(SETLIST_ITEMS_TABLE)
    .delete()
    .eq('id', itemId)
    .eq('setlist_id', setlistId);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not remove that item.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ deleted: true });
}
