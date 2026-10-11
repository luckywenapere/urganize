import { NextRequest, NextResponse } from 'next/server';
import { openVoiceGate, readCredits } from '../_shared';
import { billOwedMinutes, loadVoiceSession, updateVoiceSession } from '@/lib/urgans-voice-realtime-server';

// POST /api/urgans/voice/end: hang up.
//
// Bills whatever has started since the last tick (from the server's clock,
// capped at the call's 30 minutes), marks the call ended and returns the
// summary card's numbers. Idempotent: ending an ended call returns its summary
// and bills nothing. The token counts the browser relays from the realtime
// model are advisory, kept only to reconcile the flat rate against cost.

export const maxDuration = 15;

const END_REASONS = new Set(['user', 'goodbye', 'silence', 'out_of_credits', 'call_cap', 'daily_cap', 'error', 'disconnected']);

const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(Math.round(value), 50_000_000) : null;

export async function POST(request: NextRequest) {
  const gate = await openVoiceGate(request);
  if ('error' in gate) return gate.error;

  const body = (await request.json().catch(() => null)) as {
    sessionId?: unknown;
    reason?: unknown;
    usage?: { audioIn?: unknown; audioOut?: unknown; text?: unknown };
  } | null;
  const session =
    typeof body?.sessionId === 'string' ? await loadVoiceSession(gate.auth.adminClient, body.sessionId, gate.auth.user.id) : null;
  if (!session || session.workspace_id !== gate.workspaceId) {
    return NextResponse.json({ error: 'That call is not running.' }, { status: 404 });
  }

  const summary = (row: typeof session) => ({
    sessionId: row.id,
    minutes: row.minutes_billed,
    credits: row.credits_charged,
    actions: row.actions_count,
  });
  if (session.status === 'ended') return NextResponse.json({ ended: true, ...summary(session) });

  const admin = gate.auth.adminClient;
  const credits = await readCredits(gate);
  // The time used is billed even when the next minute would be refused.
  await billOwedMinutes(admin, { session, actorUserId: gate.auth.user.id, credits });

  const reason = typeof body?.reason === 'string' && END_REASONS.has(body.reason) ? body.reason : 'user';
  await updateVoiceSession(admin, session.id, {
    status: 'ended',
    ended_at: new Date().toISOString(),
    end_reason: reason,
    pending_action: null,
    tokens_in_audio: count(body?.usage?.audioIn),
    tokens_out_audio: count(body?.usage?.audioOut),
    tokens_text: count(body?.usage?.text),
  });

  return NextResponse.json({ ended: true, ...summary(session) });
}
