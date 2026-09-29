import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CURATOR_INBOX_STATUSES,
  PITCHES_TABLE,
  curatorPitchColumns,
  flagOffResponse,
  isPitchingFeatureEnabled,
  parseReply,
  requireCuratorUser,
  toCuratorPitch,
} from '../../_shared';
import { acceptsPitchReply, isPitchStatus } from '@/lib/pitching';
import { isPitchPaymentsEnabled, validatePaidFeedback } from '@/lib/pitch-payments';
import { ALREADY_REPLIED, DECIDE_WITH_REPLY, WINDOW_CLOSED } from '@/lib/pitch-payment-copy';
import { PAYMENTS_TABLE, notifyArtistOfReply } from '@/lib/pitch-payments-server';
import type { PitchStatus } from '@/types/pitching';

/**
 * Moving a pitch through New, Listened, Added, Passed, with a reply on the two
 * decided states.
 *
 * A FREE pitch may move from any status to any other. A curator who taps Passed
 * by mistake has to be able to take it back, and a strict state machine would
 * make that a support request. The reply follows the status: moving back to New
 * or Listened clears it, so a card can never show an answer that no longer
 * matches its state.
 *
 * A PAID pitch is different, because an artist bought something: a listen and a
 * written reply inside the window. So Accept or Pass needs at least 15 words,
 * happens once, and only before the deadline. After that the decision is final
 * and the artist is told. Those rules follow the ROW, not the feature flag: a
 * pitch someone paid for keeps its rules even if paid pitching is switched off
 * later, the same reason the refunds are not behind the flag.
 *
 * This is the only write path for a pitch's status. There is no UPDATE policy on
 * the table at all, so a curator cannot move a status directly through PostgREST
 * even for their own row. It never touches the two statuses only the system
 * sets: a pitch waiting for payment answers 404, exactly as if it did not exist.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ pitchId: string }> }
) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const auth = await requireCuratorUser(request);
  if ('error' in auth) return auth.error;

  const { pitchId } = await context.params;
  if (!pitchId) {
    return NextResponse.json({ error: 'Pitch id is required.' }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (!isPitchStatus(payload.status)) {
    return NextResponse.json({ error: 'Pick a status.' }, { status: 400 });
  }
  const status = payload.status;

  // select('*') ON PURPOSE, and only here: this is the one read that has to work
  // on either side of the payments migration (payment_kind does not exist
  // before it). Nothing from it is returned; the response is built field by
  // field by toCuratorPitch, so no release or owner id can reach the curator.
  const { data: current, error: readError } = await auth.adminClient
    .from(PITCHES_TABLE)
    .select('*')
    .eq('id', pitchId)
    .eq('curator_user_id', auth.user.id)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: readError.message || 'Could not update the pitch.' }, { status: 500 });
  }
  const row = current as Record<string, unknown> | null;
  if (!row || row.status === 'awaiting_payment') {
    return NextResponse.json({ error: 'Pitch not found.' }, { status: 404 });
  }
  if (row.status === 'expired') {
    return NextResponse.json({ error: WINDOW_CLOSED }, { status: 409 });
  }

  if (row.payment_kind === 'paid') {
    return updatePaidPitch(auth.adminClient, auth.user.id, pitchId, row, status, payload);
  }

  const updates: Record<string, unknown> = { status };

  if (acceptsPitchReply(status)) {
    if ('reply' in payload && payload.reply !== null && payload.reply !== undefined) {
      const parsed = parseReply(payload.reply);
      if ('error' in parsed) return parsed.error;
      updates.curator_reply = parsed.value || null;
    } else {
      updates.curator_reply = null;
    }
  } else {
    if (
      'reply' in payload &&
      typeof payload.reply === 'string' &&
      payload.reply.trim()
    ) {
      return NextResponse.json(
        { error: 'Add a reply when you mark a song added or passed.' },
        { status: 400 }
      );
    }
    updates.curator_reply = null;
  }

  const { data, error } = await auth.adminClient
    .from(PITCHES_TABLE)
    .update(updates)
    .eq('id', pitchId)
    .eq('curator_user_id', auth.user.id)
    .in('status', CURATOR_INBOX_STATUSES)
    .select(curatorPitchColumns(isPitchPaymentsEnabled()))
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not update the pitch.' },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: 'Pitch not found.' }, { status: 404 });
  }

  return NextResponse.json({ pitch: toCuratorPitch(data as unknown as Record<string, unknown>) });
}

const isDecided = (value: unknown): boolean => value === 'added' || value === 'passed';

async function loadOwnShare(admin: SupabaseClient, curatorUserId: string, pitchId: string): Promise<number | null> {
  const { data } = await admin
    .from(PAYMENTS_TABLE)
    .select('curator_share_kobo')
    .eq('pitch_id', pitchId)
    .eq('curator_user_id', curatorUserId)
    .maybeSingle();
  const share = Number((data as Record<string, unknown> | null)?.curator_share_kobo);
  return Number.isFinite(share) ? share : null;
}

/**
 * The paid pitch rules. Every write is CONDITIONAL on the state the checks
 * above saw, so the sweep expiring the pitch and the curator replying in the
 * last second cannot both win: expire_paid_pitch() and this update each
 * require the pitch to still be waiting, and only one can find it so.
 */
async function updatePaidPitch(
  admin: SupabaseClient,
  curatorUserId: string,
  pitchId: string,
  current: Record<string, unknown>,
  status: PitchStatus,
  payload: Record<string, unknown>
) {
  const columns = curatorPitchColumns(true);
  const now = new Date();
  const nowIso = now.toISOString();

  if (isDecided(current.status)) {
    return NextResponse.json({ error: ALREADY_REPLIED }, { status: 409 });
  }

  if (acceptsPitchReply(status)) {
    const due = Date.parse(String(current.response_due_at || ''));
    if (!Number.isFinite(due) || due <= now.getTime()) {
      return NextResponse.json({ error: WINDOW_CLOSED }, { status: 409 });
    }

    const feedback = validatePaidFeedback(payload.reply);
    if (!feedback.ok) return NextResponse.json({ error: feedback.error }, { status: 400 });

    const { data, error } = await admin
      .from(PITCHES_TABLE)
      .update({ status, curator_reply: feedback.value, responded_at: nowIso })
      .eq('id', pitchId)
      .eq('curator_user_id', curatorUserId)
      .eq('payment_kind', 'paid')
      .in('status', ['new', 'listened'])
      .gt('response_due_at', nowIso)
      .select(columns)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message || 'Could not save your reply.' }, { status: 500 });
    }
    if (!data) return explainLostRace(admin, curatorUserId, pitchId);

    await notifyArtistOfReply(admin, pitchId);
    const shareKobo = await loadOwnShare(admin, curatorUserId, pitchId);
    return NextResponse.json({ pitch: toCuratorPitch(data as unknown as Record<string, unknown>, { shareKobo }) });
  }

  // New or Listened on a paid pitch is the curator's own bookkeeping. It
  // carries no reply, because a reply is a decision.
  if ('reply' in payload && typeof payload.reply === 'string' && payload.reply.trim()) {
    return NextResponse.json({ error: DECIDE_WITH_REPLY }, { status: 400 });
  }

  const { data, error } = await admin
    .from(PITCHES_TABLE)
    .update({ status, curator_reply: null })
    .eq('id', pitchId)
    .eq('curator_user_id', curatorUserId)
    .eq('payment_kind', 'paid')
    .in('status', ['new', 'listened'])
    .select(columns)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message || 'Could not update the pitch.' }, { status: 500 });
  }
  if (!data) return explainLostRace(admin, curatorUserId, pitchId);

  const shareKobo = await loadOwnShare(admin, curatorUserId, pitchId);
  return NextResponse.json({ pitch: toCuratorPitch(data as unknown as Record<string, unknown>, { shareKobo }) });
}

/** The conditional write found nothing: say which of the two reasons it was. */
async function explainLostRace(admin: SupabaseClient, curatorUserId: string, pitchId: string) {
  const { data } = await admin
    .from(PITCHES_TABLE)
    .select('status')
    .eq('id', pitchId)
    .eq('curator_user_id', curatorUserId)
    .maybeSingle();
  const status = (data as Record<string, unknown> | null)?.status;
  if (isDecided(status)) return NextResponse.json({ error: ALREADY_REPLIED }, { status: 409 });
  return NextResponse.json({ error: WINDOW_CLOSED }, { status: 409 });
}
