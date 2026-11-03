import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { GatewayError } from '@/lib/ai/gateway-error';
import { routeModel, startTrace, startUnroutedTrace } from '@/lib/ai/model-router';

// How /api/urgans uses the model router. The invariant that matters most is the
// boring one: with AI_ROUTER unset the route calls the runner and records the
// turn exactly as it did before the router existed. action-ceiling.test.ts pins
// the ceiling; this pins the routing on top of it.

const runChappiAgent = vi.fn();
const closeConfirmedAction = vi.fn();
const executeToolCall = vi.fn();
const recordUrgansAction = vi.fn();

// What getTeamAccessForUser answers, changed per test.
const team = vi.hoisted(() => ({
  value: { primaryWorkspaceId: 'ws-1', ownerUserId: 'owner-1', tier: 'manager', state: 'paid' } as Record<string, unknown>,
}));

vi.mock('@/app/api/_shared/auth', () => ({
  requireAuthenticatedAdmin: async () => ({
    user: { id: 'user-1', email: 'manager@example.com' },
    supabaseUrl: 'https://supabase.test',
    adminClient: {},
  }),
}));

vi.mock('@/lib/chappi/config', () => ({
  isChappiEnabled: () => true,
  isChappiModelConfigured: () => true,
}));

vi.mock('@/lib/chappi/dispatch', () => ({
  executeToolCall: (...args: unknown[]) => executeToolCall(...args),
  resolveChappiContext: async () => ({
    user: { id: 'user-1' },
    adminClient: {},
    workspaceIds: ['ws-1'],
    releaseOwnerIds: ['user-1'],
    artistScopeByOwnerId: {},
    artistScopeByWorkspaceId: {},
    origin: 'https://app.test',
    authToken: 'jwt',
  }),
}));

vi.mock('@/lib/chappi/runner', () => ({
  runChappiAgent: (...args: unknown[]) => runChappiAgent(...args),
  closeConfirmedAction: (...args: unknown[]) => closeConfirmedAction(...args),
}));

vi.mock('@/lib/chappi/system-prompt', () => ({
  buildChappiSystemPrompt: async () => ({ prompt: 'system prompt', briefSections: [] }),
}));

vi.mock('@/lib/team-billing-server', () => ({
  getTeamAccessForUser: async () => team.value,
}));

vi.mock('@/lib/urgans-usage-server', () => ({
  checkUrgansAllowance: async () => ({ allowed: true, limit: null, current: 0, remaining: null }),
  recordUrgansAction: (...args: unknown[]) => recordUrgansAction(...args),
}));

vi.mock('@/lib/seats-server', () => ({ recordLimitHit: vi.fn() }));

import { POST, maxDuration } from './route';
import { TURN_BUDGET_MS } from '@/lib/chappi/routing';

const post = (body: Record<string, unknown>) =>
  new NextRequest('https://app.test/api/urgans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt' },
    body: JSON.stringify(body),
  });

const messages = [{ id: 'm1', role: 'user', content: 'what is due this week' }];
const HEAVY = [
  'That is wrong, try again. Why did the last rollout underperform, and what should I change?',
  'Compare it with the two before it, then also prioritize the plan for each channel across the next six weeks.',
  'x'.repeat(600),
].join(' ');

/** A finished turn as the runner reports it, with a routed trace. */
function finishedTurn(over: Record<string, unknown> = {}) {
  const decision = routeModel({ surface: 'chat', chat: { lastUserText: 'hi', userTurns: 1 }, env: {} });
  const trace = startTrace(decision, 'on');
  trace.models = ['openai/gpt-4o-mini'];
  trace.tokensIn = 800;
  trace.tokensOut = 50;
  trace.latencyMs = 1300;
  trace.rounds = 1;
  return { reply: 'ok', clientActions: [], pendingConfirmation: null, trace, ...over };
}

beforeEach(() => {
  runChappiAgent.mockReset();
  closeConfirmedAction.mockReset();
  executeToolCall.mockReset();
  recordUrgansAction.mockReset();
  team.value = { primaryWorkspaceId: 'ws-1', ownerUserId: 'owner-1', tier: 'manager', state: 'paid' };
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the turn budget', () => {
  it('stops a turn well inside the ceiling of the route, so there is time left to answer', () => {
    // The route is killed at maxDuration. A turn that only stops when it is
    // killed never gets to record itself or tell the user anything.
    expect(TURN_BUDGET_MS).toBeLessThanOrEqual(maxDuration * 1000 - 5_000);
    expect(TURN_BUDGET_MS).toBeGreaterThan(30_000);
  });
});

describe('POST /api/urgans with the router off (the default)', () => {
  it('runs the turn with no routing and records it with no metadata, exactly as before', async () => {
    runChappiAgent.mockResolvedValue({
      reply: 'ok',
      clientActions: [],
      pendingConfirmation: null,
      trace: startUnroutedTrace('chat', 'openai/gpt-4o-mini'),
    });

    const response = await POST(post({ messages }));

    expect(response!.status).toBe(200);
    expect('routing' in runChappiAgent.mock.calls[0][0]).toBe(false);
    const recorded = recordUrgansAction.mock.calls[0][1] as Record<string, unknown>;
    expect(recorded).toEqual({ workspaceId: 'ws-1', ownerUserId: 'owner-1', actorUserId: 'user-1' });
    expect('metadata' in recorded).toBe(false);
    expect(console.info).not.toHaveBeenCalled();
  });

  it('does not change the closing line after an approved card', async () => {
    executeToolCall.mockResolvedValue({ ok: true, summary: 'Deleted.' });
    closeConfirmedAction.mockResolvedValue('Gone.');

    await POST(post({ messages, confirmedAction: { toolName: 'delete_release', args: { releaseId: 'r1' } } }));

    expect(closeConfirmedAction.mock.calls[0][0].routing).toBeUndefined();
  });
});

describe('POST /api/urgans with the router live', () => {
  beforeEach(() => {
    vi.stubEnv('AI_ROUTER', 'on');
  });

  it('hands the runner the turn\'s decision, chosen from the conversation and the plan', async () => {
    runChappiAgent.mockResolvedValue(finishedTurn());

    await POST(post({ messages: [{ id: 'm1', role: 'user', content: HEAVY }] }));

    const { routing } = runChappiAgent.mock.calls[0][0];
    expect(routing.decision).toMatchObject({ surface: 'chat', tier: 'pro', ceiling: 'pro' });
    expect(routing.closeoutDecision).toMatchObject({ surface: 'chat_closeout', tier: 'quick' });
    expect(routing.deadlineMs).toBeGreaterThan(Date.now());
  });

  it('holds a Solo team to standard however hard the question is', async () => {
    team.value = { ...team.value, tier: 'solo' };
    runChappiAgent.mockResolvedValue(finishedTurn());

    await POST(post({ messages: [{ id: 'm1', role: 'user', content: HEAVY }] }));

    expect(runChappiAgent.mock.calls[0][0].routing.decision.tier).toBe('standard');
  });

  it('does not give a trial the flagship, though a trial resolves to the uncapped tier', async () => {
    team.value = { ...team.value, tier: 'label', state: 'trial' };
    runChappiAgent.mockResolvedValue(finishedTurn());

    await POST(post({ messages: [{ id: 'm1', role: 'user', content: HEAVY }] }));

    expect(runChappiAgent.mock.calls[0][0].routing.decision.tier).toBe('pro');
  });

  it('stores the turn\'s routing on the same billing event, under one key', async () => {
    runChappiAgent.mockResolvedValue(finishedTurn());

    await POST(post({ messages }));

    const recorded = recordUrgansAction.mock.calls[0][1] as { metadata: { routing: Record<string, unknown> } };
    expect(Object.keys(recorded.metadata)).toEqual(['routing']);
    expect(recorded.metadata.routing).toMatchObject({
      mode: 'on',
      surface: 'chat',
      models: ['openai/gpt-4o-mini'],
      tokens_in: 800,
      rounds: 1,
    });
  });

  it('routes the closing line after an approved card, on the cheap rung', async () => {
    executeToolCall.mockResolvedValue({ ok: true, summary: 'Deleted.' });
    closeConfirmedAction.mockResolvedValue('Gone.');

    await POST(post({ messages, confirmedAction: { toolName: 'delete_release', args: { releaseId: 'r1' } } }));

    expect(closeConfirmedAction.mock.calls[0][0].routing.decision).toMatchObject({
      surface: 'chat_closeout',
      tier: 'quick',
    });
  });

  it('copes with a runner that reports no trace', async () => {
    runChappiAgent.mockResolvedValue({ reply: 'ok', clientActions: [], pendingConfirmation: null });

    const response = await POST(post({ messages }));

    expect(response!.status).toBe(200);
    expect('metadata' in (recordUrgansAction.mock.calls[0][1] as object)).toBe(false);
  });
});

describe('POST /api/urgans with the router in shadow', () => {
  beforeEach(() => {
    vi.stubEnv('AI_ROUTER', 'shadow');
  });

  it('keeps today\'s model: the runner is not given a routing plan', async () => {
    runChappiAgent.mockResolvedValue({
      reply: 'ok',
      clientActions: [],
      pendingConfirmation: null,
      trace: { ...startUnroutedTrace('chat', 'openai/gpt-4o-mini'), models: ['openai/gpt-4o-mini'], tokensIn: 700 },
    });

    await POST(post({ messages: [{ id: 'm1', role: 'user', content: HEAVY }] }));

    expect('routing' in runChappiAgent.mock.calls[0][0]).toBe(false);
  });

  it('records what the router would have chosen next to what actually answered', async () => {
    runChappiAgent.mockResolvedValue({
      reply: 'ok',
      clientActions: [],
      pendingConfirmation: null,
      trace: {
        ...startUnroutedTrace('chat', 'openai/gpt-4o-mini'),
        models: ['openai/gpt-4o-mini'],
        tokensIn: 700,
        tokensOut: 30,
        latencyMs: 900,
        rounds: 1,
      },
    });

    await POST(post({ messages: [{ id: 'm1', role: 'user', content: HEAVY }] }));

    const recorded = recordUrgansAction.mock.calls[0][1] as { metadata: { routing: Record<string, unknown> } };
    expect(recorded.metadata.routing).toMatchObject({
      mode: 'shadow',
      start_tier: 'pro',
      would_use_model: 'openai/gpt-6.1-sol',
      models: ['openai/gpt-4o-mini'],
      tokens_in: 700,
    });
    // And one log line, because a shadow run's whole purpose is to be read.
    expect(console.info).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/urgans when the turn fails', () => {
  const failWith = async (error: unknown) => {
    runChappiAgent.mockRejectedValue(error);
    const response = await POST(post({ messages }));
    return { status: response!.status, body: await response!.json() };
  };

  it('reports the gateway\'s own rate limit as busy, which the old message match missed', async () => {
    const result = await failWith(
      new GatewayError('Chappi gateway request failed (429): {"error":{"code":"rate_limit_exceeded"}}', {
        status: 429,
        code: 'rate_limit_exceeded',
      })
    );
    expect(result).toEqual({ status: 503, body: { mode: 'error', error: 'AI is busy. Try again in a moment.' } });
    expect(console.error).not.toHaveBeenCalled();
    expect(recordUrgansAction).not.toHaveBeenCalled();
  });

  it('reports a timeout as too slow', async () => {
    const abort = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    const result = await failWith(abort);
    expect(result).toEqual({ status: 504, body: { mode: 'error', error: 'AI took too long. Try again.' } });
  });

  it('tells the user only that it is unavailable when the balance is empty, and says why in the log', async () => {
    const result = await failWith(
      new GatewayError('Chappi gateway request failed (402): insufficient_balance', {
        status: 402,
        code: 'insufficient_balance',
      })
    );
    expect(result).toEqual({ status: 503, body: { mode: 'error', error: 'AI is unavailable right now.' } });
    expect(String((console.error as ReturnType<typeof vi.fn>).mock.calls[0][0])).toMatch(/balance/i);
  });

  it('logs an unrecognised failure once and answers unavailable', async () => {
    const result = await failWith(new Error('something new'));
    expect(result.status).toBe(503);
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
