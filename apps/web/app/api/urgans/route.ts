import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin } from '@/app/api/_shared/auth';
import { isChappiEnabled, isChappiModelConfigured } from '@/lib/chappi/config';
import { executeToolCall, resolveChappiContext } from '@/lib/chappi/dispatch';
import { buildChappiSystemPrompt } from '@/lib/chappi/system-prompt';
import { closeConfirmedAction, runChappiAgent } from '@/lib/chappi/runner';
import { getChappiTool } from '@/lib/chappi/tools';
import type {
  ChappiConfirmedAction,
  ChappiMessage,
  ChappiReleaseScope,
  ChappiResponse,
} from '@/lib/chappi/types';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { checkUrgansAllowance, recordUrgansAction } from '@/lib/urgans-usage-server';
import { recordLimitHit } from '@/lib/seats-server';

// Same budget rationale as the plan routes: the agent's tool rounds +
// model latency must fit inside Vercel's function ceiling, so the loop is
// capped (MAX_ROUNDS in runner.ts) to land a handled response before 60s.
export const maxDuration = 60;

// Cap how much conversation the client can push, to bound token cost.
const MAX_MESSAGES = 20;

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

  const auth = await requireAuthenticatedAdmin(request);
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
    const capped = team.primaryWorkspaceId
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

    const { reply, clientActions, pendingConfirmation } = await runChappiAgent({
      ctx,
      system,
      messages: messages.slice(-MAX_MESSAGES),
    });

    // Counted after the turn succeeded, so a gateway failure is never charged.
    if (team.primaryWorkspaceId) {
      await recordUrgansAction(auth.adminClient, {
        workspaceId: team.primaryWorkspaceId,
        ownerUserId: team.ownerUserId,
        actorUserId: auth.user.id,
      });
    }

    return NextResponse.json({
      mode: 'agent',
      reply,
      clientActions,
      pendingConfirmation,
      briefSections: built.briefSections,
    } satisfies ChappiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UrgAns failed.';
    const status = (error as { status?: number } | null)?.status;
    const isAbort =
      (error as { name?: string } | null)?.name === 'AbortError' || /abort|timeout/i.test(message);

    if (isAbort) {
      return NextResponse.json(
        { mode: 'error', error: 'UrgAns took too long. Try again.' } satisfies ChappiResponse,
        { status: 504 }
      );
    }
    if (status === 429 || /rate[- ]limit/i.test(message)) {
      return NextResponse.json(
        { mode: 'error', error: 'UrgAns is busy. Try again in a moment.' } satisfies ChappiResponse,
        { status: 503 }
      );
    }
    console.error('[chappi] agent run failed:', error);
    return NextResponse.json(
      { mode: 'error', error: 'UrgAns is unavailable right now.' } satisfies ChappiResponse,
      { status: 503 }
    );
  }
}
