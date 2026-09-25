import { NextRequest, NextResponse } from 'next/server';
import { parseSetlistName } from '@/lib/setlist';
import { describeSentSetRefusal } from '@/lib/dj-pack';
import {
  DJ_PACKS_TABLE,
  DJ_PACK_RECIPIENTS_TABLE,
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
 * SENT SETS ARE KEPT (founder call, 2026-09-25). dj_packs.setlist_id is ON
 * DELETE RESTRICT, and the pack carries the access log — the only record of who
 * downloaded an unreleased track — so deleting a set that went to anyone would
 * erase that record. The refusal names who it went to and offers renaming.
 *
 * A set with a pack NOBODY was ever added to is an ordinary set: creating a
 * pack is a click, not a promise to anyone. Its empty pack goes first (the
 * restrict would refuse otherwise), then the set.
 *
 * This replaced "Revoke the pack first, then delete it", which pointed at an
 * action that did not exist, so a set that ever had a pack was undeletable.
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

  const packs = await adminClient!.from(DJ_PACKS_TABLE).select('id').eq('setlist_id', setlistId);

  // Fails CLOSED on an unreadable read, unlike most counts in this codebase:
  // being wrong here erases the record of who downloaded a track, and being
  // wrong the other way just makes a manager retry.
  if (packs.error) {
    return NextResponse.json(
      { error: 'Could not check whether this set has been sent. Try again.' },
      { status: 500 }
    );
  }

  const packIds = (packs.data || []).map((row) => String(asRow(row).id || '')).filter(Boolean);

  if (packIds.length > 0) {
    const recipients = await adminClient!
      .from(DJ_PACK_RECIPIENTS_TABLE)
      .select('recipient_name,created_at')
      .in('pack_id', packIds)
      .order('created_at', { ascending: true });

    if (recipients.error) {
      return NextResponse.json(
        { error: 'Could not check whether this set has been sent. Try again.' },
        { status: 500 }
      );
    }

    const names = (recipients.data || []).map((row) => String(asRow(row).recipient_name || ''));
    if (names.length > 0) {
      return NextResponse.json(
        { error: describeSentSetRefusal(names), code: 'set_was_sent' },
        { status: 409 }
      );
    }

    const removal = await adminClient!.from(DJ_PACKS_TABLE).delete().in('id', packIds);
    if (removal.error) {
      return NextResponse.json(
        { error: removal.error.message || 'Could not delete the set.' },
        { status: 500 }
      );
    }
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
