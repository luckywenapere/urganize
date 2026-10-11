import { NextRequest, NextResponse } from 'next/server';
import { openVoiceGate, readCredits, requireActiveSession } from '../_shared';
import { VOICE_REFUSAL_COPY } from '@/lib/urgans-voice-realtime';
import { billOwedMinutes, getVoiceConfig, synthesizeSpeech, updateVoiceSession } from '@/lib/urgans-voice-realtime-server';

// POST /api/urgans/voice/speak: UrgAns's reply, spoken, for a CASCADE call.
// Text to speech through the gateway (gpt-4o-mini-tts, verified on RodiumAi
// 2026-10-11), returned as audio/mpeg. Part of the per-minute charge.

export const maxDuration = 30;

const MAX_SPOKEN_CHARS = 600;

export async function POST(request: NextRequest) {
  const gate = await openVoiceGate(request);
  if ('error' in gate) return gate.error;

  const body = (await request.json().catch(() => null)) as { sessionId?: unknown; text?: unknown } | null;
  const found = await requireActiveSession(gate, body?.sessionId);
  if ('error' in found) return found.error;
  const { session } = found;

  const text = typeof body?.text === 'string' ? body.text.trim().slice(0, MAX_SPOKEN_CHARS) : '';
  if (!text) return NextResponse.json({ error: 'Nothing to say.' }, { status: 400 });

  const config = getVoiceConfig();
  if (!config.gateway) return NextResponse.json({ error: "Voice isn't available right now." }, { status: 503 });

  const admin = gate.auth.adminClient;
  const billed = await billOwedMinutes(admin, { session, actorUserId: gate.auth.user.id, credits: await readCredits(gate) });
  // A refusal still lets the goodbye be spoken: the refusal copy is short, and
  // a call that ends in silence reads as broken. The call is ended either way.
  if (billed.decision.kind === 'refuse') {
    await updateVoiceSession(admin, session.id, { status: 'ended', ended_at: new Date().toISOString(), end_reason: billed.decision.reason, pending_action: null });
  }
  const say = billed.decision.kind === 'refuse' ? VOICE_REFUSAL_COPY[billed.decision.reason] : text;

  let upstream: Response;
  try {
    upstream = await synthesizeSpeech(config, say);
  } catch {
    return NextResponse.json({ error: 'Voice is unreachable right now.' }, { status: 503 });
  }
  if (!upstream.ok || !upstream.body) {
    console.error(`[urgans-voice] speech upstream answered ${upstream.status}.`);
    return NextResponse.json({ error: 'Voice hit an error.' }, { status: 502 });
  }
  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
      'Cache-Control': 'no-store',
      ...(billed.decision.kind === 'refuse' ? { 'X-Voice-Ended': billed.decision.reason } : {}),
    },
  });
}
