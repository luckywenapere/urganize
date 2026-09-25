import { NextRequest, NextResponse } from 'next/server';
import {
  MAX_RUN_OF_SHOW_STEPS,
  parseRunOfShowAt,
  parseRunOfShowLabel,
} from '@/lib/events';
import {
  RUN_OF_SHOW_COLUMNS,
  RUN_OF_SHOW_TABLE,
  asRow,
  createAdminClient,
  ensureEventAccess,
  eventsDisabledResponse,
  isEventsFeatureEnabled,
  requireActiveAuthenticatedUser,
  toRunOfShowItem,
} from '../../_shared';

/**
 * POST /api/events/[eventId]/run-of-show — add a step to the night.
 *
 * The run of show was seeded on every show and could never be edited (found
 * 2026-09-25): six rows of "to confirm" forever. This and its sibling are the
 * whole editing surface. A new step goes to the end; the page orders timed
 * steps by their time (orderRunOfShow), so where it lands in the list is
 * decided by when it happens, not by when it was typed.
 *
 * Stamped with the SHOW'S owner, never the acting teammate — the rule every
 * row under a show follows, so the step lives and dies with the show.
 */
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
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Send the step.' }, { status: 400 });
  }

  const label = parseRunOfShowLabel((body as Record<string, unknown>).label);
  if ('error' in label) return NextResponse.json({ error: label.error }, { status: 400 });

  const at = parseRunOfShowAt((body as Record<string, unknown>).at ?? null);
  if ('error' in at) return NextResponse.json({ error: at.error }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureEventAccess(adminClient, eventId, auth.user, true);
  if ('error' in access) return access.error;

  const existing = await adminClient!
    .from(RUN_OF_SHOW_TABLE)
    .select('id,position')
    .eq('event_id', eventId);
  if (existing.error) {
    return NextResponse.json(
      { error: existing.error.message || 'Could not load the run of show.' },
      { status: 500 }
    );
  }

  const steps = (existing.data || []).map(asRow);
  if (steps.length >= MAX_RUN_OF_SHOW_STEPS) {
    return NextResponse.json(
      { error: `That is a lot of steps. Keep it to ${MAX_RUN_OF_SHOW_STEPS}.` },
      { status: 409 }
    );
  }

  const position =
    steps.reduce(
      (highest, step) => Math.max(highest, typeof step.position === 'number' ? step.position : 0),
      -1
    ) + 1;

  const { data, error } = await adminClient!
    .from(RUN_OF_SHOW_TABLE)
    .insert({
      owner_user_id: access.ownerUserId,
      event_id: eventId,
      label: label.label,
      at: at.at,
      position,
    })
    .select(RUN_OF_SHOW_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Could not add the step.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ item: toRunOfShowItem(asRow(data)) }, { status: 201 });
}
