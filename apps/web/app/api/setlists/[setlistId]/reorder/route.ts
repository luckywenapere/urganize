import { NextRequest, NextResponse } from 'next/server';
import {
  SETLIST_ITEMS_TABLE,
  asRow,
  createAdminClient,
  ensureSetlistAccess,
  eventsDisabledResponse,
  isEventsFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '@/app/api/events/_shared';

/**
 * POST /api/setlists/[setlistId]/reorder — body `{ itemIds: string[] }`.
 *
 * Takes the WHOLE running order rather than a move instruction, and that is
 * deliberate. A drag produces a new order on the client; sending "move item X
 * to position 4" makes the server reconstruct what the client already knows,
 * and the two disagree the moment a second person is editing. Sending the
 * order makes the last writer win cleanly, which for one manager dragging
 * their own set is the honest model.
 *
 * The ids must be exactly the set's current items — no additions, no
 * omissions. Anything else means the client is working from a stale list, and
 * writing a partial order would silently drop songs out of the running order
 * while leaving them in the set.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ setlistId: string }> }
) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { setlistId } = await context.params;
  if (!setlistId) {
    return NextResponse.json({ error: 'A set id is required.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const itemIds = Array.isArray(body?.itemIds) ? body.itemIds : null;
  if (!itemIds || itemIds.some((id: unknown) => typeof id !== 'string' || !id)) {
    return NextResponse.json({ error: 'Send the new running order.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureSetlistAccess(adminClient, setlistId, auth.user, true);
  if ('error' in access) return access.error;

  const current = await adminClient!
    .from(SETLIST_ITEMS_TABLE)
    .select('id')
    .eq('setlist_id', setlistId);

  if (current.error) {
    return NextResponse.json(
      { error: current.error.message || 'Could not load the set.' },
      { status: 500 }
    );
  }

  const existing = new Set((current.data || []).map((row) => String(asRow(row).id)));
  const incoming = new Set(itemIds as string[]);

  if (
    incoming.size !== itemIds.length ||
    incoming.size !== existing.size ||
    [...incoming].some((id) => !existing.has(id))
  ) {
    return NextResponse.json(
      { error: 'That running order is out of date. Reload the set and try again.' },
      { status: 409 }
    );
  }

  // Sequential rather than batched: supabase-js has no multi-row update with
  // differing values, and an upsert would need every column of every row.
  // A set is tens of items, and this runs once per drag.
  for (let position = 0; position < itemIds.length; position += 1) {
    const { error } = await adminClient!
      .from(SETLIST_ITEMS_TABLE)
      .update({ position })
      .eq('id', itemIds[position])
      .eq('setlist_id', setlistId);

    if (error) {
      return NextResponse.json(
        { error: error.message || 'Could not save the new order.' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ reordered: itemIds.length });
}
