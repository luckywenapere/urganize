import { NextRequest, NextResponse } from 'next/server';
import { openVoiceGate, readCredits, requireActiveSession } from '../_shared';
import { VOICE_REFUSAL_COPY, minutesAffordable, shouldWarn } from '@/lib/urgans-voice-realtime';
import { billOwedMinutes, updateVoiceSession } from '@/lib/urgans-voice-realtime-server';

// POST /api/urgans/voice/tick: the browser's heartbeat, every 60 seconds.
//
// Bills every minute that has STARTED since the call was last billed, worked
// out from the server's own start time (the body carries only the call id).
// The next minute is REFUSED when the balance cannot pay for it, the call is at
// 30 minutes, or the team at 120 minutes today: the call is marked ended and the
// browser ends it politely. `warn` turns the meter amber a minute early.

export const maxDuration = 15;

export async function POST(request: NextRequest) {
  const gate = await openVoiceGate(request);
  if ('error' in gate) return gate.error;

  const body = (await request.json().catch(() => null)) as { sessionId?: unknown } | null;
  const found = await requireActiveSession(gate, body?.sessionId);
  if ('error' in found) return found.error;
  const { session } = found;

  const admin = gate.auth.adminClient;
  const credits = await readCredits(gate);
  const billed = await billOwedMinutes(admin, { session, actorUserId: gate.auth.user.id, credits });

  if (billed.decision.kind === 'refuse') {
    await updateVoiceSession(admin, session.id, {
      status: 'ended',
      ended_at: new Date().toISOString(),
      end_reason: billed.decision.reason,
      pending_action: null,
    });
    return NextResponse.json(
      {
        ok: false,
        ended: true,
        reason: billed.decision.reason,
        spoken: VOICE_REFUSAL_COPY[billed.decision.reason],
        minutesBilled: billed.minutesBilled,
        creditsCharged: billed.creditsCharged,
        balance: billed.balance,
      },
      { status: billed.decision.reason === 'out_of_credits' ? 402 : 429 }
    );
  }

  return NextResponse.json({
    ok: true,
    minutesBilled: billed.minutesBilled,
    creditsCharged: billed.creditsCharged,
    balance: billed.balance,
    minutesAffordable: billed.balance === null ? null : minutesAffordable(billed.balance),
    warn: shouldWarn({ balance: billed.balance, minutesBilled: billed.minutesBilled, teamMinutesToday: billed.teamMinutesToday }),
  });
}
