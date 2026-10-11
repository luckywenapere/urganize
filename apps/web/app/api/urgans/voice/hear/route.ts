import { NextRequest, NextResponse } from 'next/server';
import { openVoiceGate, readCredits, requireActiveSession } from '../_shared';
import { VOICE_REFUSAL_COPY } from '@/lib/urgans-voice-realtime';
import { billOwedMinutes, getVoiceConfig, transcribeTurn, updateVoiceSession } from '@/lib/urgans-voice-realtime-server';
import { parseTranscription, validateVoiceClip } from '@/lib/urgans-voice';

// POST /api/urgans/voice/hear: one spoken turn of a CASCADE call, to text.
//
// The browser cuts the turn when the speaker pauses (its own voice-activity
// detection) and posts the clip here; gpt-transcribe returns the words. Part of
// the call's per-minute charge, so it is neither counted against dictation's
// 100-a-day cap nor charged on its own. The audio is streamed through and
// never stored, as with dictation.

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const gate = await openVoiceGate(request);
  if ('error' in gate) return gate.error;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Audio form data is required.' }, { status: 400 });

  const found = await requireActiveSession(gate, form.get('sessionId'));
  if ('error' in found) return found.error;
  const { session } = found;

  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'An audio clip is required.' }, { status: 400 });
  const validation = validateVoiceClip({ mimeType: file.type || '', size: file.size });
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: validation.tooLarge ? 413 : 400 });

  const config = getVoiceConfig();
  if (!config.gateway) return NextResponse.json({ error: "Voice isn't available right now." }, { status: 503 });

  const admin = gate.auth.adminClient;
  const billed = await billOwedMinutes(admin, { session, actorUserId: gate.auth.user.id, credits: await readCredits(gate) });
  if (billed.decision.kind === 'refuse') {
    await updateVoiceSession(admin, session.id, { status: 'ended', ended_at: new Date().toISOString(), end_reason: billed.decision.reason, pending_action: null });
    return NextResponse.json({ ended: true, reason: billed.decision.reason, spoken: VOICE_REFUSAL_COPY[billed.decision.reason] }, { status: 402 });
  }

  const hint = form.get('hint');
  let upstream: Response;
  try {
    upstream = await transcribeTurn(config, file, typeof hint === 'string' ? hint.trim().slice(0, 200) : '');
  } catch {
    return NextResponse.json({ error: 'Voice is unreachable right now.' }, { status: 503 });
  }
  if (!upstream.ok) {
    console.error(`[urgans-voice] transcription upstream answered ${upstream.status}.`);
    return NextResponse.json({ error: "Didn't catch that." }, { status: 502 });
  }
  const raw = await upstream.text().catch(() => '');
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A bare string is fine; parseTranscription reads it.
  }
  return NextResponse.json({ text: parseTranscription(parsed) ?? '', minutesBilled: billed.minutesBilled, balance: billed.balance });
}
