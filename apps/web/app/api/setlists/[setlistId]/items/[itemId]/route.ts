import { NextRequest, NextResponse } from 'next/server';
import { parseSetlistItemPatch, type SetlistItemType } from '@/lib/setlist';
import {
  SETLIST_ITEMS_TABLE,
  SETLIST_ITEM_COLUMNS,
  asRow,
  createAdminClient,
  ensureSetlistAccess,
  eventsDisabledResponse,
  isEventsFeatureEnabled,
  requireActiveAuthenticatedUser,
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
  const parsed = parseSetlistItemPatch(body, currentType);
  if (parsed.errors.length > 0) {
    return NextResponse.json(
      { error: parsed.errors[0].message, fieldErrors: parsed.errors },
      { status: 400 }
    );
  }

  const { data, error } = await adminClient!
    .from(SETLIST_ITEMS_TABLE)
    .update(parsed.columns)
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
