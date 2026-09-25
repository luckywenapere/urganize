import { NextRequest, NextResponse } from 'next/server';
import { decideReleaseAccess } from '@/lib/release-access';
import { buildReadOnlyResponse, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import {
  EVENTS_TABLE,
  asRow,
  createAdminClient,
  eventsDisabledResponse,
  isEventsFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '../../_shared';

/** Same two constraints as EVENT_NOT_FOUND_MESSAGE: never a 403 that confirms
 *  existence, and never the exact string 'Not found.'. */
const SERIES_NOT_FOUND_MESSAGE = 'Festival not found.';

/**
 * DELETE /api/events/series/[seriesId] — delete every show in a festival.
 *
 * Founder call, 2026-09-25: a festival mis-booked as 7 days × 4 artists used to
 * take 28 separate deletes. This reverses the earlier "no delete-the-festival
 * action is planned" note.
 *
 * THE SAME RULE AS DELETING ONE SHOW, applied to every member:
 * - each member must be visible and writable to the caller (decideReleaseAccess,
 *   the rule ensureEventAccess runs — read once for the workspace rather than
 *   once per show, since a festival can hold 60);
 * - and, like DELETE /api/events/[id], only the team OWNER may delete: a
 *   teammate can run a show, but removing it from the schedule is the owner's
 *   call.
 * If any member fails, nothing is deleted. Half a festival is worse than none.
 *
 * Sets, run of show and DJ packs cascade with each show, exactly as they do for
 * a single delete (see the DELETE handler's comment in ../[eventId]).
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ seriesId: string }> }
) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { seriesId } = await context.params;
  if (!seriesId) {
    return NextResponse.json({ error: 'A festival id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  const members = await adminClient
    .from(EVENTS_TABLE)
    .select('id,owner_user_id,artist_id')
    .eq('series_id', seriesId);

  if (members.error) {
    return NextResponse.json(
      { error: members.error.message || 'Could not load the festival.' },
      { status: 500 }
    );
  }

  const rows = (members.data || []).map((row) => asRow(row));
  if (rows.length === 0) {
    return NextResponse.json({ error: SERIES_NOT_FOUND_MESSAGE }, { status: 404 });
  }

  const access = await loadWorkspaceAccessContext(adminClient, auth.user);
  for (const row of rows) {
    const decision = decideReleaseAccess({
      releaseOwnerId: String(row.owner_user_id || ''),
      releaseArtistId: String(row.artist_id || ''),
      userId: auth.user.id,
      access,
      write: true,
    });
    if (decision === 'not_found') {
      return NextResponse.json({ error: SERIES_NOT_FOUND_MESSAGE }, { status: 404 });
    }
    if (decision === 'read_only') {
      return buildReadOnlyResponse();
    }
    if (String(row.owner_user_id || '') !== auth.user.id) {
      return NextResponse.json(
        { error: 'Only the team owner can delete a festival.' },
        { status: 403 }
      );
    }
  }

  // Scoped to the owner as well as the series, so the write itself cannot
  // reach a row the checks above did not see.
  const { error } = await adminClient
    .from(EVENTS_TABLE)
    .delete()
    .eq('series_id', seriesId)
    .eq('owner_user_id', auth.user.id);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not delete the festival.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ deleted: rows.length });
}
