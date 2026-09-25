import { NextRequest, NextResponse } from 'next/server';
import { listWorkspaceArtists } from '@/lib/artists-server';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { decideReleaseAccess } from '@/lib/release-access';
import { DEFAULT_TIMEZONE, parseEventPatch, rescheduleRunOfShowStep } from '@/lib/events';
import { defaultPackExpiry } from '@/lib/dj-pack';
import {
  DJ_PACKS_TABLE,
  EVENTS_TABLE,
  EVENT_COLUMNS,
  RUN_OF_SHOW_COLUMNS,
  RUN_OF_SHOW_TABLE,
  createAdminClient,
  ensureEventAccess,
  eventsDisabledResponse,
  isEventsFeatureEnabled,
  requireActiveAuthenticatedUser,
  toRunOfShowItem,
  toShowEvent,
  asRow,
} from '../_shared';

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
    .select(RUN_OF_SHOW_COLUMNS)
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

  // What this viewer may do, computed with the same rule the write routes
  // enforce, so the page shows no control that would end in a refusal: a guest
  // sees no Edit, and only the team owner sees Delete (matching the DELETE
  // handler below).
  const permissions = {
    canEdit:
      decideReleaseAccess({
        releaseOwnerId: access.ownerUserId,
        releaseArtistId: access.artistId,
        userId: auth.user.id,
        access: workspace,
        write: true,
      }) === 'allow',
    canDelete: access.ownerUserId === auth.user.id,
  };

  return NextResponse.json({
    event: toShowEvent(access.event, artistName),
    runOfShow: (runOfShow.data || []).map((row) => toRunOfShowItem(asRow(row))),
    permissions,
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

  if (Object.prototype.hasOwnProperty.call(parsed.columns, 'set_start_at')) {
    const previousTimezone = access.event.timezone ? String(access.event.timezone) : DEFAULT_TIMEZONE;
    await followReschedule(adminClient!, eventId, {
      previousStart: access.event.set_start_at ? String(access.event.set_start_at) : null,
      nextStart: parsed.columns.set_start_at ?? null,
      previousTimezone,
      nextTimezone: parsed.columns.timezone ?? previousTimezone,
    });
  }

  return NextResponse.json({ event: toShowEvent(asRow(data)) });
}

const sameInstant = (a: string | null, b: string | null): boolean => {
  if (!a || !b) return a === b;
  return Date.parse(a) === Date.parse(b);
};

/**
 * A moved show takes its night with it.
 *
 * Two things hang off the set time and both went stale on a reschedule before
 * 2026-09-25:
 *
 * 1. The RUN OF SHOW. Its times are real instants, so a show pushed back a
 *    week left soundcheck and doors on the old date. Every timed step now
 *    keeps its clock time and its day relative to the show (see
 *    rescheduleRunOfShowStep, which also says why moving by the same number
 *    of hours was an hour out across a clock change).
 * 2. The PACK EXPIRY, fixed at creation to three days after the show. A show
 *    moved later had its links die before it happened; a show gaining its
 *    first date kept links that never expired. Recomputed from the new date.
 *
 * BEST-EFFORT, deliberately: the show itself is saved, which is what the
 * manager asked for, and failing that save over a follow-up would lose it. A
 * failure is logged; the next reschedule recomputes both from scratch anyway.
 */
async function followReschedule(
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
  eventId: string,
  times: {
    previousStart: string | null;
    nextStart: string | null;
    previousTimezone: string;
    nextTimezone: string;
  }
): Promise<void> {
  const { previousStart, nextStart, previousTimezone, nextTimezone } = times;
  if (sameInstant(previousStart, nextStart)) return;

  // Steps only move between two real dates: a show gaining its first date has
  // no timed steps to anchor, and one losing its date keeps them.
  if (previousStart && nextStart) {
    const steps = await adminClient
      .from(RUN_OF_SHOW_TABLE)
      .select('id,at')
      .eq('event_id', eventId)
      .not('at', 'is', null);
    if (steps.error) {
      console.error('[events] run of show read failed on reschedule', {
        eventId,
        message: steps.error.message,
      });
    } else {
      for (const step of steps.data || []) {
        const row = asRow(step);
        const moved = rescheduleRunOfShowStep({
          atIso: row.at ? String(row.at) : null,
          previousStartIso: previousStart,
          nextStartIso: nextStart,
          previousTimezone,
          nextTimezone,
        });
        if (!moved) continue;
        const update = await adminClient
          .from(RUN_OF_SHOW_TABLE)
          .update({ at: moved })
          .eq('id', String(row.id))
          .eq('event_id', eventId);
        if (update.error) {
          console.error('[events] run of show shift failed', {
            eventId,
            message: update.error.message,
          });
        }
      }
    }
  }

  const packs = await adminClient
    .from(DJ_PACKS_TABLE)
    .update({ expires_at: defaultPackExpiry(nextStart) })
    .eq('event_id', eventId);
  if (packs.error) {
    console.error('[events] pack expiry recompute failed', {
      eventId,
      message: packs.error.message,
    });
  }
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
      { error: 'Only the team owner can delete a show.' },
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
