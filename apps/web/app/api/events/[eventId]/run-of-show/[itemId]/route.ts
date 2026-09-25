import { NextRequest, NextResponse } from 'next/server';
import { parseRunOfShowAt, parseRunOfShowLabel } from '@/lib/events';
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
} from '../../../_shared';

const STEP_NOT_FOUND = 'That step is not on this show.';

type Params = { params: Promise<{ eventId: string; itemId: string }> };

/**
 * PATCH — rename a step, or set or clear its time. Sparse: only what was sent
 * is written. Every write is scoped to BOTH ids, so a step id from another
 * show cannot be edited through a show you do happen to have access to.
 */
export async function PATCH(request: NextRequest, context: Params) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { eventId, itemId } = await context.params;
  if (!eventId || !itemId) {
    return NextResponse.json({ error: 'A show and a step are required.' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Send what changed.' }, { status: 400 });
  }

  const columns: { label?: string; at?: string | null } = {};
  if (Object.prototype.hasOwnProperty.call(body, 'label')) {
    const label = parseRunOfShowLabel(body.label);
    if ('error' in label) return NextResponse.json({ error: label.error }, { status: 400 });
    columns.label = label.label;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'at')) {
    const at = parseRunOfShowAt(body.at);
    if ('error' in at) return NextResponse.json({ error: at.error }, { status: 400 });
    columns.at = at.at;
  }
  if (Object.keys(columns).length === 0) {
    return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureEventAccess(adminClient, eventId, auth.user, true);
  if ('error' in access) return access.error;

  const { data, error } = await adminClient!
    .from(RUN_OF_SHOW_TABLE)
    .update(columns)
    .eq('id', itemId)
    .eq('event_id', eventId)
    .select(RUN_OF_SHOW_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not save the step.' },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: STEP_NOT_FOUND }, { status: 404 });
  }

  return NextResponse.json({ item: toRunOfShowItem(asRow(data)) });
}

/** DELETE — a show with no soundcheck is a real show. */
export async function DELETE(request: NextRequest, context: Params) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { eventId, itemId } = await context.params;
  if (!eventId || !itemId) {
    return NextResponse.json({ error: 'A show and a step are required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureEventAccess(adminClient, eventId, auth.user, true);
  if ('error' in access) return access.error;

  const { data, error } = await adminClient!
    .from(RUN_OF_SHOW_TABLE)
    .delete()
    .eq('id', itemId)
    .eq('event_id', eventId)
    .select('id');

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not remove the step.' },
      { status: 500 }
    );
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: STEP_NOT_FOUND }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
