import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin } from '@/app/api/_shared/auth';
import { requireEntitlement } from '@/lib/entitlements';
import { isChappiEnabled, isChappiModelConfigured } from '@/lib/chappi/config';
import { resolveChappiContext } from '@/lib/chappi/dispatch';
import { buildChappiSystemPrompt } from '@/lib/chappi/system-prompt';
import { runChappiAgent } from '@/lib/chappi/runner';
import type { ChappiMessage, ChappiResponse } from '@/lib/chappi/types';

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

export async function POST(request: NextRequest) {
  if (!isChappiEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  // Chappi is paid-tier (URG-178) — a live entitlement check, not the static
  // NEXT_PUBLIC_FEATURE_CHAPPI flag above (that's the master on/off switch;
  // this is per-user, based on subscription/founding-member/allowlist state).
  const entitlement = await requireEntitlement(
    'chappiAssistant',
    auth.user.id,
    auth.user.email,
    auth.adminClient
  );
  if ('error' in entitlement) return entitlement.error;

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
    const system = await buildChappiSystemPrompt(ctx);
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
