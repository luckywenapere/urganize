import { NextRequest, NextResponse } from 'next/server';
import { parseSetlistName } from '@/lib/setlist';
import {
  SETLISTS_TABLE,
  SETLIST_COLUMNS,
  asRow,
  createAdminClient,
  ensureSetlistAccess,
  eventsDisabledResponse,
  isEventsFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '@/app/api/events/_shared';

/** Rename a set ("Main set" → "Festival 25"). */
export async function PATCH(
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
  const parsed = parseSetlistName(body?.name);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureSetlistAccess(adminClient, setlistId, auth.user, true);
  if ('error' in access) return access.error;

  const { data, error } = await adminClient!
    .from(SETLISTS_TABLE)
    .update({ name: parsed.name })
    .eq('id', setlistId)
    .select(SETLIST_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Could not rename the set.' },
      { status: 500 }
    );
  }

  const row = asRow(data);
  return NextResponse.json({
    setlist: {
      id: String(row.id || ''),
      eventId: String(row.event_id || ''),
      name: String(row.name || ''),
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    },
  });
}

/**
 * DELETE a set. Its items cascade.
 *
 * REFUSED when a DJ pack points at it — dj_packs.setlist_id is ON DELETE
 * RESTRICT, because a sent pack is a promise to someone outside the team and
 * deleting the set would break their link the night before a show. Postgres
 * would refuse this anyway; catching it here turns a raw foreign-key error
 * into a sentence naming what to do about it (the artist-deletion pattern).
 */
export async function DELETE(
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

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureSetlistAccess(adminClient, setlistId, auth.user, true);
  if ('error' in access) return access.error;

  const packs = await adminClient!
    .from('dj_packs')
    .select('id', { count: 'exact', head: true })
    .eq('setlist_id', setlistId);

  // Fails CLOSED on an unreadable count, unlike most counts in this codebase:
  // being wrong here breaks a link somebody is relying on to play a show, and
  // being wrong the other way just makes a manager retry.
  if (packs.error) {
    return NextResponse.json(
      { error: 'Could not check whether this set has been sent. Try again.' },
      { status: 500 }
    );
  }

  if ((packs.count ?? 0) > 0) {
    const count = packs.count ?? 0;
    return NextResponse.json(
      {
        error:
          count === 1
            ? 'This set has been sent to someone. Revoke the pack first, then delete it.'
            : `This set has been sent in ${count} packs. Revoke them first, then delete it.`,
      },
      { status: 409 }
    );
  }

  const { error } = await adminClient!.from(SETLISTS_TABLE).delete().eq('id', setlistId);
  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not delete the set.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ deleted: true });
}
