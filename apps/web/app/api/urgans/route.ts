import { NextRequest, NextResponse } from 'next/server';
import { requireUrgansAccess } from '@/app/api/_shared/urgans-access';
import { mintPassForUser } from '@/lib/urgans-pass-server';
import { getChappiModelConfig, isChappiEnabled, isChappiModelConfigured } from '@/lib/chappi/config';
import { executeToolCall, resolveChappiContext } from '@/lib/chappi/dispatch';
import { buildChappiSystemPrompt } from '@/lib/chappi/system-prompt';
import { closeConfirmedAction, runChappiAgent } from '@/lib/chappi/runner';
import {
  AGENT_ALERT_LOG_LINES,
  completeShadowTrace,
  describeAgentError,
  planChatRouting,
  planCloseoutRouting,
  routingMetadata,
} from '@/lib/chappi/routing';
import { logRoutingTrace } from '@/lib/ai/routing-log';
import {
  URGANS_STREAM_CONTENT_TYPE,
  encodeStreamEvent,
  isUrgansStreamOn,
  requestWantsStream,
  type UrgansStreamEvent,
} from '@/lib/chappi/stream-protocol';
import { getChappiTool } from '@/lib/chappi/tools';
import type {
  ChappiConfirmedAction,
  ChappiMessage,
  ChappiReleaseScope,
  ChappiResponse,
} from '@/lib/chappi/types';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { checkUrgansAllowance, recordUrgansAction } from '@/lib/urgans-usage-server';
import { logBillingEvent } from '@/lib/billing-events-server';
import { isCreditsEnabled } from '@/lib/credits/config';
import { outOfCreditsNotice } from '@/lib/credits/copy';
import { getCreditSnapshot, settleTurn, type CreditSnapshot } from '@/lib/credits/credits-server';
import { canStartTurn, holdCredits, turnCharge } from '@/lib/credits/pricing';
import { randomUUID } from 'node:crypto';
import { recordLimitHit } from '@/lib/seats-server';
import { CHAPPI_HISTORY_LIMIT } from '@/lib/chappi/conversation-history';

// Same budget rationale as the plan routes: the agent's tool rounds +
// model latency must fit inside Vercel's function ceiling, so the loop is
// capped (MAX_ROUNDS in runner.ts) to land a handled response before 60s.
export const maxDuration = 60;

// Cap how much conversation reaches the model, to bound token cost. Shared
// with the client (conversation-history.ts), which trims to the same number
// before sending: a saved chat can run to hundreds of messages, and the model
// never reads past the last twenty either way.
const MAX_MESSAGES = CHAPPI_HISTORY_LIMIT;

// Feature flag — when off, POST 404s so a direct API call can't invoke the
// model either (mirrors the plan routes / generate-status).
function parseMessages(raw: unknown): ChappiMessage[] {
  if (!raw || typeof raw !== 'object') return [];
  const list = (raw as { messages?: unknown }).messages;
  if (!Array.isArray(list)) return [];

  const messages: ChappiMessage[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim()) {
      messages.push({ id: String((item as { id?: unknown }).id ?? ''), role, content });
    }
  }
  return messages;
}

// The optional release scope the client's picker pinned the conversation to.
// Advisory only — every tool re-validates ids against live rows — so shape
// validation (non-empty strings, sane lengths) is all that's needed here.
function parseReleaseScope(raw: unknown): ChappiReleaseScope | null {
  if (!raw || typeof raw !== 'object') return null;
  const scope = (raw as { releaseScope?: unknown }).releaseScope;
  if (!scope || typeof scope !== 'object') return null;
  const id = (scope as { id?: unknown }).id;
  const title = (scope as { title?: unknown }).title;
  if (typeof id !== 'string' || !id.trim() || id.length > 100) return null;
  if (typeof title !== 'string' || !title.trim()) return null;
  return { id: id.trim(), title: title.trim().slice(0, 200) };
}

/**
 * The approve leg of a confirmation. Shape validation only — the tool itself
 * re-validates every id server-side, exactly as it would have on the normal
 * path, so nothing here is trusted beyond "this is the right shape".
 */
function parseConfirmedAction(raw: unknown): ChappiConfirmedAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const action = (raw as { confirmedAction?: unknown }).confirmedAction;
  if (!action || typeof action !== 'object') return null;
  const toolName = (action as { toolName?: unknown }).toolName;
  const args = (action as { args?: unknown }).args;
  if (typeof toolName !== 'string' || !toolName.trim() || toolName.length > 60) return null;
  if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) {
    return null;
  }
  return {
    toolName: toolName.trim(),
    args: (args as Record<string, unknown>) ?? {},
  };
}

export async function POST(request: NextRequest) {
  if (!isChappiEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireUrgansAccess(request);
  if ('error' in auth) return auth.error;

  // Degraded mode: no capable model configured → tell the client to run the
  // deterministic intent-router. This is what keeps the front door useful
  // before Claude is wired (Phase 4).
  if (!isChappiModelConfigured()) {
    return NextResponse.json({ mode: 'deterministic' } satisfies ChappiResponse);
  }

  const body = await request.json().catch(() => null);
  const messages = parseMessages(body);
  if (messages.length === 0) {
    return NextResponse.json({ error: 'A non-empty messages array is required.' }, { status: 400 });
  }

  const confirmedAction = parseConfirmedAction(body);
  // Only confirmation-gated tools may travel the approve path. Without this,
  // it would be a second, unguarded way to invoke ANY tool by name — the model
  // loop's own validation is bypassed here by design, so the gate has to be
  // re-checked from the registry rather than trusted from the request.
  if (confirmedAction && !getChappiTool(confirmedAction.toolName)?.confirm) {
    return NextResponse.json(
      { error: 'That action does not require confirmation.' },
      { status: 400 }
    );
  }

  const authToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const origin = new URL(request.url).origin;

  try {
    const ctx = await resolveChappiContext({
      user: auth.user,
      adminClient: auth.adminClient,
      origin,
      authToken,
      // Only for a credits-only team that holds credits: lets the assistant's own
      // tool calls through the paywall (lib/urgans-pass.ts). Nobody else gets one.
      ...(auth.creditsOnly?.funded ? { urgansPass: mintPassForUser(auth.user.id) } : {}),
    });
    const releaseScope = parseReleaseScope(body);
    const built = await buildChappiSystemPrompt(ctx);
    let system = built.prompt;
    if (releaseScope) {
      system += `\n\nThe user has scoped this conversation to the rollout "${releaseScope.title}" (rollout id: ${releaseScope.id}). Unless they clearly name a different rollout, interpret questions and actions as being about this rollout and pass its id to tools. If the id doesn't resolve, say so instead of guessing.`;
    }

    if (confirmedAction) {
      // The user clicked Approve. Run exactly this one tool — full per-tool
      // validation (ownership, flags, dependency gates) still applies inside
      // executeToolCall — then let the model write the closing line.
      const result = await executeToolCall(ctx, confirmedAction.toolName, confirmedAction.args);
      const closing = await closeConfirmedAction({
        system,
        messages: messages.slice(-MAX_MESSAGES),
        toolName: confirmedAction.toolName,
        result,
        // Undefined unless the router is live, so this is the call it always was.
        routing: planCloseoutRouting(),
      });
      return NextResponse.json({
        mode: 'agent',
        // The action already ran; never let a model failure hide its outcome.
        reply: closing || result.summary,
        clientActions: result.ok ? (result.clientAction ? [result.clientAction] : [{ type: 'refresh' }]) : [],
        pendingConfirmation: null,
        briefSections: built.briefSections,
      } satisfies ChappiResponse);
    }

    // Assistant action ceiling. Reached only here, AFTER the confirmedAction
    // branch above has returned, and that placement is the point: the
    // confirmation replay calls the model too (closeConfirmedAction), so
    // checking earlier would bill a user an action for clicking Approve on a
    // permission card. Deterministic mode never reaches this far either — it
    // returns before the body is read.
    //
    // The billable unit is one TURN, not one gateway round: runChappiAgent
    // loops up to MAX_ROUNDS times per turn.
    const team = await getTeamAccessForUser(auth.user.id, auth.user.email);

    // Which model answers. With AI_ROUTER unset this is { mode: 'off' } and the
    // turn below runs exactly as it did before the router existed; in shadow it
    // only records what the router would have chosen; live, it decides. The team
    // is read for its plan ceiling, and by `state` as well as `tier`: `tier`
    // alone reports the uncapped flagship for a trial (see resolveCeiling).
    // Decided BEFORE the credit check because that check is for the model the
    // turn is about to start on; it is a pure decision and costs nothing.
    const trimmed = messages.slice(-MAX_MESSAGES);
    // Decided before the model is chosen: a streamed reply is allowed to be
    // longer, because one that runs out of time is cut off and kept.
    const wantsStream = isUrgansStreamOn() && requestWantsStream(request.headers);
    const plan = planChatRouting({ messages: trimmed, team, streaming: wantsStream });

    // Credits, when switched on, REPLACE the monthly action ceiling: a turn is
    // paid for in credits worked out from the tokens it really used (see
    // lib/credits). With the flag off nothing below this line reads a credit and
    // the ceiling counts turns exactly as it always did. The check sits here for
    // the same reason the ceiling did: after the confirmation branch has
    // returned, so approving a card is never billed.
    const creditsOn = isCreditsEnabled();
    let credits: CreditSnapshot | null = null;
    if (creditsOn && team.primaryWorkspaceId) {
      credits = await getCreditSnapshot(auth.adminClient, {
        workspaceId: team.primaryWorkspaceId,
        ownerUserId: team.ownerUserId,
        team,
      });
      // Unreadable (null) means do not enforce: see credits-server.ts.
      const holdModel = plan.mode === 'on' ? plan.routing.decision.model : (getChappiModelConfig()?.model ?? '');
      if (credits && !canStartTurn(credits.total, holdCredits(holdModel))) {
        await logBillingEvent(auth.adminClient, {
          workspaceId: team.primaryWorkspaceId,
          ownerUserId: team.ownerUserId,
          actorUserId: auth.user.id,
          type: 'limit_hit',
          metadata: {
            entitlement: 'urgans_credits',
            limit: credits.referenceCredits,
            current: credits.total,
            account: credits.account,
          },
        });
        // 'deterministic' with a notice and a 429, exactly as the old ceiling
        // answered: typed commands and chips still work and cost nothing.
        return NextResponse.json(
          {
            mode: 'deterministic',
            notice: outOfCreditsNotice({ account: credits.account, nextGrantAt: credits.nextGrantAt }),
          } satisfies ChappiResponse,
          { status: 429 }
        );
      }
    }

    const capped =
      !creditsOn && team.primaryWorkspaceId
        ? await checkUrgansAllowance(auth.adminClient, {
            workspaceId: team.primaryWorkspaceId,
            ownerUserId: team.ownerUserId,
            tier: team.tier,
          })
        : null;

    if (capped && !capped.allowed) {
      await recordLimitHit(auth.adminClient, {
        workspaceId: team.primaryWorkspaceId ?? '',
        ownerUserId: team.ownerUserId,
        actorUserId: auth.user.id,
        key: capped.key,
        limit: capped.limit,
        current: capped.current,
      });
      // 'deterministic' rather than 'error', deliberately (founder call): the
      // client's fallback keyword router and action chips keep working, so a
      // capped team can still create releases, activities and notes by typing.
      // That path makes no model call, costs us nothing, and is already what
      // production serves whenever no model is configured. The message is
      // carried alongside so the UI can say why.
      return NextResponse.json(
        { mode: 'deterministic', notice: capped.message } satisfies ChappiResponse,
        // 429 is not otherwise emitted by this route — the catch block below
        // maps an upstream 429 down to a 503 — so a 429 here unambiguously
        // means "your ceiling", never "gateway busy".
        { status: 429 }
      );
    }

    // The whole turn, from the model call to the charge. Run the same way whether
    // the answer is streamed or not: only how the result leaves differs.
    const runTurn = async (stream?: {
      onText: (delta: string) => void;
      onAttempt: () => void;
    }): Promise<ChappiResponse> => {
      const { reply, clientActions, pendingConfirmation, trace, usageCalls } = await runChappiAgent({
        ctx,
        system,
        messages: trimmed,
        ...(plan.mode === 'on' ? { routing: plan.routing } : {}),
        ...(stream ?? {}),
      });

      // The record of what the router did (or, in shadow, would have done). Absent
      // for a turn it did not touch, so that row is what it always was.
      const routed =
        plan.mode === 'on' ? trace : plan.mode === 'shadow' ? (trace ? completeShadowTrace(plan.trace, trace) : plan.trace) : undefined;
      if (plan.mode === 'shadow' && routed) logRoutingTrace(routed, false);
      let metadata: Record<string, unknown> | undefined = routed ? routingMetadata(routed) : undefined;

      // Charged after the turn succeeded, so a gateway failure is never charged.
      // The cost is written onto the turn's billing event as well as the ledger, so
      // a charge the ledger failed to take can be found and reconciled from here.
      if (creditsOn && credits && team.primaryWorkspaceId) {
        const charge = turnCharge(usageCalls);
        metadata = {
          ...(metadata ?? {}),
          credits: { charged: charge.credits, rodi: Math.round(charge.rodi * 1000) / 1000, assumed: charge.assumed },
        };
        await settleTurn(auth.adminClient, {
          workspaceId: team.primaryWorkspaceId,
          ownerUserId: team.ownerUserId,
          actorUserId: auth.user.id,
          requestId: randomUUID(),
          charge,
          calls: usageCalls,
          balances: credits,
        });
      }

      // Counted after the turn succeeded, so a gateway failure is never charged.
      if (team.primaryWorkspaceId) {
        await recordUrgansAction(auth.adminClient, {
          workspaceId: team.primaryWorkspaceId,
          ownerUserId: team.ownerUserId,
          actorUserId: auth.user.id,
          ...(metadata ? { metadata } : {}),
        });
      }

      return {
        mode: 'agent',
        reply,
        clientActions,
        pendingConfirmation,
        briefSections: built.briefSections,
      } satisfies ChappiResponse;
    };

    // Streaming is opt-in on both sides: the server has to be switched on AND the
    // request has to ask, so an old client and a switched-off server both get the
    // plain JSON answer they always did. Everything above this line (auth,
    // validation, the credit and ceiling checks) has already answered as JSON
    // when it was going to refuse, so a stream only ever starts for a turn that
    // is really going to run.
    if (wantsStream) {
      return streamTurn(runTurn);
    }

    return NextResponse.json(await runTurn());
  } catch (error) {
    const { payload, status } = agentErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

/**
 * What to answer when the turn failed, and the status to answer it with. Shared
 * by the plain and the streamed paths so a failure reads the same either way.
 */
function agentErrorResponse(error: unknown): { payload: ChappiResponse; status: number } {
  const described = describeAgentError(error);

  // A slow model or a busy gateway is ordinary and logs nothing. An empty
  // balance and a rejected key are things no model can route around and only a
  // person can fix: the user is told the same thing either way, and the log is
  // where it has to be loud.
  if (described.alert) console.error(AGENT_ALERT_LOG_LINES[described.alert], error);

  return { payload: { mode: 'error', error: described.message }, status: described.status };
}

/**
 * The turn as a stream of events (lib/chappi/stream-protocol.ts): text as the
 * model writes it, then one `final` event carrying the answer the route has
 * always sent. The charge is settled inside `runTurn`, before `final`, so the
 * last event means the turn is fully accounted for. A failure is sent as a
 * `final` event too, because the status line was written before it happened.
 */
function streamTurn(runTurn: (stream: { onText: (d: string) => void; onAttempt: () => void }) => Promise<ChappiResponse>) {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: UrgansStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeStreamEvent(event)));
        } catch {
          // The reader went away. The turn still finishes and is still charged.
        }
      };

      // Text the screen is showing for the round in progress. A new round (or a
      // different model) replaces it, so tell the screen to drop it first.
      let showing = false;
      try {
        const payload = await runTurn({
          onText: (delta) => {
            showing = true;
            send({ type: 'text', delta });
          },
          onAttempt: () => {
            if (!showing) return;
            showing = false;
            send({ type: 'reset' });
          },
        });
        send({ type: 'final', data: payload });
      } catch (error) {
        send({ type: 'final', data: agentErrorResponse(error).payload });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': URGANS_STREAM_CONTENT_TYPE,
      // No caching and no proxy buffering, or the pieces arrive all at once.
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
