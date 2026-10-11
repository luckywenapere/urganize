import { NextRequest, NextResponse } from 'next/server';
import { openVoiceGate, readCredits, requireActiveSession } from '../_shared';
import {
  VOICE_CREDITS_PER_MINUTE,
  VOICE_MAX_CALL_MINUTES,
  VOICE_REFUSAL_COPY,
  VOICE_TICK_SECONDS,
  decideStart,
  minutesAffordable,
} from '@/lib/urgans-voice-realtime';
import {
  VoiceUpstreamError,
  billOwedMinutes,
  buildGreeting,
  buildVoiceInstructions,
  createVoiceSession,
  getVoiceConfig,
  mintRealtimeSecret,
  teamMinutesToday,
  updateVoiceSession,
  voiceModelFor,
  type VoiceContext,
} from '@/lib/urgans-voice-realtime-server';
import { buildTranscriptionPrompt } from '@/lib/urgans-voice';

// POST /api/urgans/voice/session: start a call.
//
// Pre-flight (the spec's order): the voice flag, the UrgAns gate, credits on,
// a team, at least one minute of credit, the team's daily minutes not used up.
// Then a voice_sessions row (the server's clock for every minute), then, for
// the realtime transport, a short-lived client secret for the browser to open
// WebRTC with. The first minute is billed here, because a call that has
// connected has started its first minute.

export const maxDuration = 30;

function parseContext(body: unknown): VoiceContext {
  const raw = (body as { releaseScope?: unknown; firstName?: unknown } | null) ?? {};
  const scope = raw.releaseScope as { id?: unknown; title?: unknown; daysToRelease?: unknown } | undefined;
  const release =
    scope && typeof scope.id === 'string' && typeof scope.title === 'string' && scope.title.trim()
      ? {
          id: scope.id.trim().slice(0, 100),
          title: scope.title.replace(/["\u0000-\u001f]/g, ' ').trim().slice(0, 120),
          daysToRelease:
            typeof scope.daysToRelease === 'number' && Number.isFinite(scope.daysToRelease)
              ? Math.round(scope.daysToRelease)
              : null,
        }
      : null;
  const firstName =
    typeof raw.firstName === 'string' && raw.firstName.trim()
      ? raw.firstName.replace(/[^\p{L}\p{M}' -]/gu, '').trim().slice(0, 40) || null
      : null;
  return { release, firstName };
}

export async function POST(request: NextRequest) {
  const gate = await openVoiceGate(request);
  if ('error' in gate) return gate.error;

  const config = getVoiceConfig();
  if (config.transport === 'cascade' && !config.gateway) {
    return NextResponse.json({ error: "Voice isn't available right now." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const context = parseContext(body);
  const admin = gate.auth.adminClient;

  // The one reconnect of a realtime call (its WebRTC link dropped): a fresh
  // client secret for the SAME call. No new row and no new minute; the call's
  // clock keeps running from when it started.
  const resumeId = (body as { resumeSessionId?: unknown } | null)?.resumeSessionId;
  if (resumeId !== undefined) {
    const found = await requireActiveSession(gate, resumeId);
    if ('error' in found) return found.error;
    if (found.session.transport !== 'realtime' || config.transport !== 'realtime') {
      return NextResponse.json({ error: 'That call cannot reconnect.' }, { status: 409 });
    }
    try {
      const secret = await mintRealtimeSecret(config, {
        instructions: `${buildVoiceInstructions(context)}\nThe call just reconnected: say "I'm back." and carry on.`,
        safetyIdentifier: gate.auth.user.id,
      });
      return NextResponse.json({ sessionId: found.session.id, realtime: { clientSecret: secret.value, expiresAt: secret.expiresAt, callsUrl: secret.callsUrl, model: secret.model } });
    } catch {
      return NextResponse.json({ error: 'Voice could not reconnect.' }, { status: 502 });
    }
  }

  const [credits, minutesToday] = await Promise.all([readCredits(gate), teamMinutesToday(admin, gate.workspaceId, null)]);
  const balance = credits ? credits.total : null;
  const start = decideStart({ balance, teamMinutesToday: minutesToday ?? 0 });
  if (!start.ok) {
    return NextResponse.json(
      { error: VOICE_REFUSAL_COPY[start.reason], reason: start.reason, balance },
      { status: start.reason === 'out_of_credits' ? 402 : 429 }
    );
  }

  const session = await createVoiceSession(admin, {
    workspaceId: gate.workspaceId,
    ownerUserId: gate.team.ownerUserId,
    userId: gate.auth.user.id,
    releaseId: context.release?.id ?? null,
    transport: config.transport,
    model: voiceModelFor(config),
  });
  if (!session) {
    // Most likely the migration has not been applied yet.
    return NextResponse.json({ error: "Voice isn't available right now." }, { status: 503 });
  }

  const hint = buildTranscriptionPrompt({ releaseTitle: context.release?.title ?? null });
  let realtime: Awaited<ReturnType<typeof mintRealtimeSecret>> | null = null;
  if (config.transport === 'realtime') {
    try {
      realtime = await mintRealtimeSecret(config, {
        instructions: buildVoiceInstructions(context),
        transcriptionHint: hint,
        safetyIdentifier: gate.auth.user.id,
      });
    } catch (error) {
      await updateVoiceSession(admin, session.id, {
        status: 'ended',
        ended_at: new Date().toISOString(),
        end_reason: 'error',
      });
      const status = error instanceof VoiceUpstreamError ? error.status : 502;
      return NextResponse.json({ error: 'Voice could not connect. Try again, or type instead.' }, { status });
    }
  }

  // The first minute has started.
  const billed = await billOwedMinutes(admin, { session, actorUserId: gate.auth.user.id, credits });

  return NextResponse.json({
    sessionId: session.id,
    transport: config.transport,
    model: session.model,
    greeting: buildGreeting(context),
    transcriptionHint: hint,
    ratePerMinute: VOICE_CREDITS_PER_MINUTE,
    tickSeconds: VOICE_TICK_SECONDS,
    maxMinutes: VOICE_MAX_CALL_MINUTES,
    minutesBilled: billed.minutesBilled,
    balance: billed.balance,
    minutesAffordable: billed.balance === null ? null : minutesAffordable(billed.balance),
    startedAt: session.started_at,
    ...(realtime
      ? { realtime: { clientSecret: realtime.value, expiresAt: realtime.expiresAt, callsUrl: realtime.callsUrl, model: realtime.model } }
      : {}),
  });
}
