import { NextRequest, NextResponse } from 'next/server';
import {
  CURATOR_PITCH_COLUMNS,
  PITCHES_TABLE,
  flagOffResponse,
  isPitchingFeatureEnabled,
  parseReply,
  requireCuratorUser,
  toCuratorPitch,
} from '../../_shared';
import { acceptsPitchReply, isPitchStatus } from '@/lib/pitching';

/**
 * Moving a pitch through New, Listened, Added, Passed, with an optional one line
 * reply on the two decided states.
 *
 * Any status may move to any other. A curator who taps Passed by mistake has to
 * be able to take it back, and a strict state machine would make that a support
 * request. The reply follows the status: moving back to New or Listened clears
 * it, so a card can never show an answer that no longer matches its state.
 *
 * This is the only write path for a pitch's status. There is no UPDATE policy on
 * the table at all, so a curator cannot move a status directly through PostgREST
 * even for their own row.
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
    .select(CURATOR_PITCH_COLUMNS)
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

  return NextResponse.json({ pitch: toCuratorPitch(data as Record<string, unknown>) });
}
