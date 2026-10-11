import { NextRequest, NextResponse } from 'next/server';
import { openVoiceGate, readCredits, requireActiveSession } from '../_shared';
import { POST as runUrgansTurn } from '@/app/api/urgans/route';
import {
  VOICE_REFUSAL_COPY,
  parseUrgansDoArgs,
  spokenSummary,
  trimTranscript,
} from '@/lib/urgans-voice-realtime';
import { billOwedMinutes, updateVoiceSession } from '@/lib/urgans-voice-realtime-server';
import type { ChappiMessage, ChappiPendingConfirmation, ChappiResponse } from '@/lib/chappi/types';

// POST /api/urgans/voice/tool: the voice model's ONE tool, urgans_do.
//
// The request is handed to the SAME handler a typed message reaches
// (app/api/urgans/route.ts, called in-process with the caller's own auth), so a
// voice request runs on the same model ladder, with the same tool scope, the
// same confirmation gate and the same per-turn credits as typing. Nothing here
// can run a tool directly.
//
// THE CONFIRMATION GATE SURVIVES VOICE. When UrgAns proposes a gated action
// (delete, invite, publish, a date change that moves tasks), the route stores
// that ONE proposal on the call's row. A spoken or tapped yes (`confirmed`)
// replays exactly the stored proposal through the typed flow's approve path;
// the voice model and the browser never supply the tool name or its arguments,
// so text the model heard (a release title, a note body) cannot talk it into a
// deletion. A new request, or a no, clears it.
//
// Every call also bills any started minute first, so a browser that stopped
// ticking still pays for the time it used.

export const maxDuration = 60;

const AFFIRMATION = 'Yes, go ahead.';

function toMessages(lines: ReturnType<typeof trimTranscript>, last: string | null): ChappiMessage[] {
  const messages: ChappiMessage[] = lines.map((line, index) => ({
    id: `voice-${index}`,
    role: line.role,
    content: line.text,
  }));
  if (last) {
    const tail = messages[messages.length - 1];
    if (!(tail && tail.role === 'user' && tail.content === last)) {
      messages.push({ id: `voice-${messages.length}`, role: 'user', content: last });
    }
  }
  return messages;
}

/** The in-process request to the typed UrgAns handler, carrying the caller's own credentials. */
function innerRequest(request: NextRequest, body: Record<string, unknown>): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json', 'x-urgans-surface': 'voice' });
  const authorization = request.headers.get('authorization');
  const cookie = request.headers.get('cookie');
  if (authorization) headers.set('authorization', authorization);
  if (cookie) headers.set('cookie', cookie);
  return new NextRequest(new URL('/api/urgans', request.url), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function spokenConfirmation(pending: ChappiPendingConfirmation): string {
  const title = pending.title.replace(/\?\s*$/, '').trim();
  const detail = pending.detail ? ` ${pending.detail.trim()}` : '';
  return `${title}.${detail} Should I go ahead?`.replace(/\.\./g, '.');
}

export async function POST(request: NextRequest) {
  const gate = await openVoiceGate(request);
  if ('error' in gate) return gate.error;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'A request is required.' }, { status: 400 });

  const found = await requireActiveSession(gate, body.sessionId);
  if ('error' in found) return found.error;
  const { session } = found;

  const args = parseUrgansDoArgs({ request: body.request, confirmed: body.confirmed, cancel: body.cancel });
  if (!args) return NextResponse.json({ error: 'A request is required.' }, { status: 400 });

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
      { ended: true, reason: billed.decision.reason, spoken: VOICE_REFUSAL_COPY[billed.decision.reason] },
      { status: billed.decision.reason === 'out_of_credits' ? 402 : 429 }
    );
  }

  if (args.cancel) {
    await updateVoiceSession(admin, session.id, { pending_action: null });
    return NextResponse.json({
      reply: "Okay, I won't do that.",
      spoken: "Okay, I won't do that.",
      pendingConfirmation: null,
      clientActions: [],
      balance: billed.balance,
      minutesBilled: billed.minutesBilled,
    });
  }

  const transcript = trimTranscript(body.transcript);
  const releaseScope = (body.releaseScope ?? null) as unknown;
  let innerBody: Record<string, unknown>;
  if (args.confirmed) {
    const pending = session.pending_action;
    if (!pending) {
      return NextResponse.json(
        { reply: 'There is nothing waiting for a yes.', spoken: 'There is nothing waiting for a yes. What would you like to do?', pendingConfirmation: null, clientActions: [] },
        { status: 409 }
      );
    }
    innerBody = {
      messages: toMessages(transcript, AFFIRMATION),
      confirmedAction: { toolName: pending.toolName, args: pending.args },
      releaseScope,
    };
    // Cleared BEFORE it runs, so a repeated yes can never run it twice.
    await updateVoiceSession(admin, session.id, { pending_action: null });
  } else {
    innerBody = { messages: toMessages(transcript, args.request), releaseScope };
    // A new request replaces any proposal still waiting.
    if (session.pending_action) await updateVoiceSession(admin, session.id, { pending_action: null });
  }

  const response = await runUrgansTurn(innerRequest(request, innerBody));
  const payload = (await response.json().catch(() => null)) as ChappiResponse | { error?: string } | null;

  if (!payload || !('mode' in payload)) {
    const message = (payload as { error?: string } | null)?.error || 'Something went wrong.';
    return NextResponse.json({ error: message, spoken: `${message} You can try again, or type instead.` }, { status: response.status >= 400 ? response.status : 502 });
  }

  if (payload.mode === 'error') {
    return NextResponse.json({ error: payload.error, spoken: `${payload.error} You can try again, or type instead.` }, { status: response.status >= 400 ? response.status : 502 });
  }

  if (payload.mode === 'deterministic') {
    // The typed route answers 'deterministic' with a notice when the team cannot
    // pay for a turn (429) or no model is configured. Either way the call
    // cannot act; say why.
    const notice = 'notice' in payload && payload.notice ? String(payload.notice) : "I can't do that by voice right now.";
    return NextResponse.json(
      { reply: notice, spoken: notice, pendingConfirmation: null, clientActions: [], outOfCredits: response.status === 429 },
      { status: response.status === 429 ? 402 : 200 }
    );
  }

  const pending = payload.pendingConfirmation ?? null;
  const acted = args.confirmed || (payload.clientActions?.length ?? 0) > 0;
  if (pending || acted) {
    await updateVoiceSession(admin, session.id, {
      ...(pending ? { pending_action: pending } : {}),
      ...(acted ? { actions_count: session.actions_count + 1 } : {}),
    });
  }

  return NextResponse.json({
    reply: payload.reply,
    spoken: pending ? spokenConfirmation(pending) : spokenSummary(payload.reply),
    pendingConfirmation: pending ? { title: pending.title, detail: pending.detail ?? null } : null,
    clientActions: payload.clientActions ?? [],
    acted,
    balance: billed.balance,
    minutesBilled: billed.minutesBilled,
  });
}
