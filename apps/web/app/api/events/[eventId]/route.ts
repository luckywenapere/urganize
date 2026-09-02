import { NextRequest, NextResponse } from 'next/server';
import { listWorkspaceArtists } from '@/lib/artists-server';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { parseEventPatch } from '@/lib/events';
import {
  EVENTS_TABLE,
  EVENT_COLUMNS,
  RUN_OF_SHOW_TABLE,
  createAdminClient,
  ensureEventAccess,
  eventsDisabledResponse,
  isEventsFeatureEnabled,
  requireActiveAuthenticatedUser,
  toShowEvent,
  asRow,
} from '../_shared';
import type { RunOfShowItem } from '@/types/events';

const toRunOfShowItem = (row: Record<string, unknown>): RunOfShowItem => ({
  id: String(row.id || ''),
  eventId: String(row.event_id || ''),
  label: String(row.label || ''),
  at: row.at ? String(row.at) : null,
  position: typeof row.position === 'number' ? row.position : 0,
});

/** The show plus its run of show — one request, because the detail screen
 *  needs both and a second round trip would just be a second spinner. */
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

  const runOfShow = await adminClient!
    .from(RUN_OF_SHOW_TABLE)
    .select('id,event_id,label,at,position')
    .eq('event_id', eventId)
    .order('position', { ascending: true });

  if (runOfShow.error) {
    return NextResponse.json(
      { error: runOfShow.error.message || 'Could not load the run of show.' },
      { status: 500 }
    );
  }

  // Resolve the artist name for display. Falls back to blank rather than
  // failing the read — a name is decoration here, the show is the payload.
  let artistName = '';
  const workspace = await loadWorkspaceAccessContext(adminClient!, auth.user);
  if (workspace.primaryWorkspaceId) {
    const roster = await listWorkspaceArtists(adminClient!, workspace.primaryWorkspaceId);
    artistName = roster.find((artist) => artist.id === access.artistId)?.name || '';
  }

  return NextResponse.json({
    event: toShowEvent(access.event, artistName),
    runOfShow: (runOfShow.data || []).map((row) => toRunOfShowItem(asRow(row))),
  });
}

/**
 * PATCH /api/events/[eventId] — SPARSE, unlike the release PATCH.
 *
 * Only the fields present in the body are written (see parseEventPatch). The
 * release handler is a full-row replace, which is why callers there have to
 * read-then-merge or silently null what they omit; this object does not
 * inherit that.
 */
export async function PATCH(
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
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Send what changed.' }, { status: 400 });
  }

  const parsed = parseEventPatch(body);
  if (parsed.errors.length > 0) {
    return NextResponse.json(
      { error: parsed.errors[0].message, fieldErrors: parsed.errors },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureEventAccess(adminClient, eventId, auth.user, true);
  if ('error' in access) return access.error;

  const { data, error } = await adminClient!
    .from(EVENTS_TABLE)
    .update(parsed.columns)
    .eq('id', eventId)
    .select(EVENT_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Could not save the show.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ event: toShowEvent(asRow(data)) });
}

/**
 * DELETE /api/events/[eventId].
 *
 * The run of show and any setlists cascade. A DJ pack does NOT block this —
 * dj_packs.event_id cascades too, which is deliberate: cancelling a show
 * should not be refused because you already sent the pack. (Deleting the
 * SETLIST out from under a live pack is the thing that is refused, at the
 * database level, because that would break a link while the show still
 * happens.)
 */
export async function DELETE(
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
  const access = await ensureEventAccess(adminClient, eventId, auth.user, true);
  if ('error' in access) return access.error;

  // Owner-only, matching release deletion: a teammate may run a show, but
  // removing it from the team's schedule is the owner's call.
  if (access.ownerUserId !== auth.user.id) {
    return NextResponse.json(
      { error: 'Only the workspace owner can delete a show.' },
      { status: 403 }
    );
  }

  const { error } = await adminClient!.from(EVENTS_TABLE).delete().eq('id', eventId);
  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not delete the show.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ deleted: true });
}
