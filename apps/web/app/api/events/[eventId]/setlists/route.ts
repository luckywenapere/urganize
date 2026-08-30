import { NextRequest, NextResponse } from 'next/server';
import { parseSetlistName } from '@/lib/setlist';
import {
  SETLISTS_TABLE,
  SETLIST_COLUMNS,
  asRow,
  createAdminClient,
  ensureEventAccess,
  eventsDisabledResponse,
  isEventsFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '../../_shared';
import type { Setlist } from '@/types/events';

const toSetlist = (row: Record<string, unknown>): Setlist => ({
  id: String(row.id || ''),
  eventId: String(row.event_id || ''),
  name: String(row.name || ''),
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
});

/** Every set built for this show, oldest first — a show can hold more than one
 *  (you build a 25 and a 40 in case the slot moves). */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { eventId } = await context.params;
  if (!eventId) {
    return NextResponse.json({ error: 'A show id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureEventAccess(adminClient, eventId, auth.user, false);
  if ('error' in access) return access.error;

  const { data, error } = await adminClient!
    .from(SETLISTS_TABLE)
    .select(SETLIST_COLUMNS)
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not load the sets.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ setlists: (data || []).map((row) => toSetlist(asRow(row))) });
}

/** Start a set. Named "Main set" unless the manager says otherwise, so the
 *  common case takes no typing. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { eventId } = await context.params;
  if (!eventId) {
    return NextResponse.json({ error: 'A show id is required.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const rawName = body && typeof body === 'object' && 'name' in body ? body.name : 'Main set';
  const parsed = parseSetlistName(rawName);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureEventAccess(adminClient, eventId, auth.user, true);
  if ('error' in access) return access.error;

  // Stamped with the SHOW's owner, never the acting teammate — same rule as
  // the event itself, and for the same reason: a set owned by a teammate would
  // sit outside the workspace everyone else reads from.
  const { data, error } = await adminClient!
    .from(SETLISTS_TABLE)
    .insert({ event_id: eventId, name: parsed.name, owner_user_id: access.ownerUserId })
    .select(SETLIST_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Could not start the set.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ setlist: toSetlist(asRow(data)) }, { status: 201 });
}
