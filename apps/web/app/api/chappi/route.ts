import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin } from '@/app/api/_shared/auth';
import { isChappiEnabled, isChappiModelConfigured } from '@/lib/chappi/config';
import { resolveChappiContext } from '@/lib/chappi/dispatch';
import { buildChappiSystemPrompt } from '@/lib/chappi/system-prompt';
import { runChappiAgent } from '@/lib/chappi/runner';
import type { ChappiMessage, ChappiReleaseScope, ChappiResponse } from '@/lib/chappi/types';

// Same budget rationale as the tailor-plan route: the agent's tool rounds +
// model latency must fit inside Vercel's function ceiling, so the loop is
// capped (MAX_ROUNDS in runner.ts) to land a handled response before 60s.
export const maxDuration = 60;

// Cap how much conversation the client can push, to bound token cost.
const MAX_MESSAGES = 20;

// Feature flag — when off, POST 404s so a direct API call can't invoke the
// model either (mirrors tailor-plan / generate-status).
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
    let system = await buildChappiSystemPrompt(ctx);
    if (releaseScope) {
      system += `\n\nThe user has scoped this conversation to the release "${releaseScope.title}" (release id: ${releaseScope.id}). Unless they clearly name a different release, interpret questions and actions as being about this release and pass its id to tools. If the id doesn't resolve, say so instead of guessing.`;
    }
    const { reply, clientActions } = await runChappiAgent({
      ctx,
      system,
      messages: messages.slice(-MAX_MESSAGES),
    });
    return NextResponse.json({ mode: 'agent', reply, clientActions } satisfies ChappiResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Chappi failed.';
    const status = (error as { status?: number } | null)?.status;
    const isAbort =
      (error as { name?: string } | null)?.name === 'AbortError' || /abort|timeout/i.test(message);

    if (isAbort) {
      return NextResponse.json(
        { mode: 'error', error: 'Chappi took too long. Try again.' } satisfies ChappiResponse,
        { status: 504 }
      );
    }
    if (status === 429 || /rate[- ]limit/i.test(message)) {
      return NextResponse.json(
        { mode: 'error', error: 'Chappi is busy. Try again in a moment.' } satisfies ChappiResponse,
        { status: 503 }
      );
    }
    console.error('[chappi] agent run failed:', error);
    return NextResponse.json(
      { mode: 'error', error: 'Chappi is unavailable right now.' } satisfies ChappiResponse,
      { status: 503 }
    );
  }
}
