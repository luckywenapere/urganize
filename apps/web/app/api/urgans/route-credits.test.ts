import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { holdCredits, turnCharge, type UsageCall } from '@/lib/credits/pricing';
import { startUnroutedTrace } from '@/lib/ai/model-router';

// How /api/urgans uses credits. The invariant that matters most is the boring
// one, same as the router's: with NEXT_PUBLIC_FEATURE_URGANS_CREDITS unset the
// route reads no credit, writes no ledger row and counts turns against the old
// monthly ceiling exactly as it did. route-routing.test.ts and
// action-ceiling.test.ts pin the rest of the route; this pins credits on top.

const runChappiAgent = vi.fn();
const closeConfirmedAction = vi.fn();
const executeToolCall = vi.fn();
const recordUrgansAction = vi.fn();
const checkUrgansAllowance = vi.fn();
const getCreditSnapshot = vi.fn();
const settleTurn = vi.fn();
const logBillingEvent = vi.fn();

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
  getChappiModelConfig: () => ({ model: 'openai/gpt-4o-mini', apiKey: 'k', baseURL: 'https://gateway.test/v1' }),
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
  checkUrgansAllowance: (...args: unknown[]) => checkUrgansAllowance(...args),
  recordUrgansAction: (...args: unknown[]) => recordUrgansAction(...args),
}));

vi.mock('@/lib/seats-server', () => ({ recordLimitHit: vi.fn() }));
vi.mock('@/lib/billing-events-server', () => ({ logBillingEvent: (...args: unknown[]) => logBillingEvent(...args) }));
vi.mock('@/lib/credits/credits-server', () => ({
  getCreditSnapshot: (...args: unknown[]) => getCreditSnapshot(...args),
  settleTurn: (...args: unknown[]) => settleTurn(...args),
}));

import { POST } from './route';

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

const CALLS: UsageCall[] = [
  { model: 'openai/gpt-4o-mini', promptTokens: 10_800, completionTokens: 80, cachedTokens: 0 },
  { model: 'openai/gpt-4o-mini', promptTokens: 11_400, completionTokens: 350, cachedTokens: 10_800 },
];

const turn = (over: Record<string, unknown> = {}) => ({
  reply: 'ok',
  clientActions: [],
  pendingConfirmation: null,
  trace: startUnroutedTrace('chat', 'openai/gpt-4o-mini'),
  usageCalls: CALLS,
  ...over,
});

const snapshot = (over: Record<string, unknown> = {}) => ({
  allowance: 500,
  topup: 0,
  total: 500,
  monthlyAllowance: 660,
  windowStart: '2026-10-01',
  resetsAt: '2026-11-01T00:00:00.000Z',
  ...over,
});

const creditsOn = () => vi.stubEnv('NEXT_PUBLIC_FEATURE_URGANS_CREDITS', 'true');

beforeEach(() => {
  for (const mock of [
    runChappiAgent,
    closeConfirmedAction,
    executeToolCall,
    recordUrgansAction,
    checkUrgansAllowance,
    getCreditSnapshot,
    settleTurn,
    logBillingEvent,
  ]) {
    mock.mockReset();
  }
  checkUrgansAllowance.mockResolvedValue({ allowed: true, limit: null, current: 0, remaining: null });
  getCreditSnapshot.mockResolvedValue(snapshot());
  runChappiAgent.mockResolvedValue(turn());
  team.value = { primaryWorkspaceId: 'ws-1', ownerUserId: 'owner-1', tier: 'manager', state: 'paid' };
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('with credits off (the default)', () => {
  it('reads no credit, charges none, and still counts turns against the old ceiling', async () => {
    const response = await POST(post({ messages }));

    expect(response!.status).toBe(200);
    expect(getCreditSnapshot).not.toHaveBeenCalled();
    expect(settleTurn).not.toHaveBeenCalled();
    expect(checkUrgansAllowance).toHaveBeenCalledTimes(1);
    const recorded = recordUrgansAction.mock.calls[0][1] as Record<string, unknown>;
    expect('metadata' in recorded).toBe(false);
  });

  it('still refuses with the old ceiling when it is hit', async () => {
    checkUrgansAllowance.mockResolvedValue({ allowed: false, limit: 150, current: 150, key: 'urgans_monthly_actions', message: 'Used up.' });

    const response = await POST(post({ messages }));

    expect(response!.status).toBe(429);
    expect(runChappiAgent).not.toHaveBeenCalled();
    expect(getCreditSnapshot).not.toHaveBeenCalled();
  });
});

describe('with credits on', () => {
  beforeEach(creditsOn);

  it('replaces the old ceiling: it is not consulted, and its count is not what refuses', async () => {
    checkUrgansAllowance.mockResolvedValue({ allowed: false, limit: 1, current: 99 });

    const response = await POST(post({ messages }));

    expect(response!.status).toBe(200);
    expect(checkUrgansAllowance).not.toHaveBeenCalled();
    expect(getCreditSnapshot).toHaveBeenCalledTimes(1);
  });

  it('charges the turn from the calls the runner reported, once, after it succeeded', async () => {
    const response = await POST(post({ messages }));
    expect(response!.status).toBe(200);

    expect(settleTurn).toHaveBeenCalledTimes(1);
    const input = settleTurn.mock.calls[0][1] as Record<string, unknown>;
    const expected = turnCharge(CALLS);
    expect(input.charge).toEqual(expected);
    expect((input.charge as { credits: number }).credits).toBeGreaterThanOrEqual(1);
    expect(input.calls).toEqual(CALLS);
    expect(input).toMatchObject({
      workspaceId: 'ws-1',
      ownerUserId: 'owner-1',
      actorUserId: 'user-1',
      windowStart: '2026-10-01',
    });
    expect(typeof input.requestId).toBe('string');
    expect((input.requestId as string).length).toBeGreaterThan(10);
  });

  it('gives every turn its own request id, so two turns are never mistaken for a repeat', async () => {
    await POST(post({ messages }));
    await POST(post({ messages }));

    const ids = settleTurn.mock.calls.map((call) => (call[1] as { requestId: string }).requestId);
    expect(new Set(ids).size).toBe(2);
  });

  it('writes what the turn cost onto its billing event, so a lost charge can be found', async () => {
    await POST(post({ messages }));

    const recorded = recordUrgansAction.mock.calls[0][1] as { metadata: { credits: Record<string, unknown> } };
    const expected = turnCharge(CALLS);
    expect(recorded.metadata.credits).toEqual({
      charged: expected.credits,
      rodi: Math.round(expected.rodi * 1000) / 1000,
      assumed: false,
    });
  });

  it('charges nothing for a turn that made no calls', async () => {
    runChappiAgent.mockResolvedValue(turn({ usageCalls: [] }));

    await POST(post({ messages }));

    expect((settleTurn.mock.calls[0][1] as { charge: { credits: number } }).charge.credits).toBe(0);
  });

  it('does not charge a turn that failed', async () => {
    runChappiAgent.mockRejectedValue(new Error('gateway down'));

    const response = await POST(post({ messages }));

    expect(response!.status).toBeGreaterThanOrEqual(500);
    expect(settleTurn).not.toHaveBeenCalled();
    expect(recordUrgansAction).not.toHaveBeenCalled();
  });

  it('never reads credits or charges when a user approves a card', async () => {
    executeToolCall.mockResolvedValue({ ok: true, summary: 'Deleted.' });
    closeConfirmedAction.mockResolvedValue('Done.');

    const response = await POST(post({ messages, confirmedAction: { toolName: 'delete_note', args: { noteId: 'n1' } } }));

    expect(response!.status).toBe(200);
    expect(getCreditSnapshot).not.toHaveBeenCalled();
    expect(settleTurn).not.toHaveBeenCalled();
  });
});

describe('refusing a turn the team cannot pay for', () => {
  beforeEach(creditsOn);

  it('answers like the old ceiling did: 429, typed commands still work, and says when credits come back', async () => {
    getCreditSnapshot.mockResolvedValue(snapshot({ allowance: 0, total: 0 }));

    const response = await POST(post({ messages }));
    const body = await response!.json();

    expect(response!.status).toBe(429);
    expect(body.mode).toBe('deterministic');
    expect(body.notice).toMatch(/out of UrgAns credits/);
    expect(body.notice).toMatch(/1 November/);
    expect(runChappiAgent).not.toHaveBeenCalled();
    expect(settleTurn).not.toHaveBeenCalled();
  });

  it('records the refusal as a limit hit, the buy signal the product already collects', async () => {
    getCreditSnapshot.mockResolvedValue(snapshot({ allowance: 0, total: 0 }));

    await POST(post({ messages }));

    expect(logBillingEvent).toHaveBeenCalledTimes(1);
    expect(logBillingEvent.mock.calls[0][1]).toMatchObject({
      workspaceId: 'ws-1',
      type: 'limit_hit',
      metadata: { entitlement: 'urgans_credits', limit: 660, current: 0 },
    });
  });

  it('lets a team start on exactly the hold for the model it is about to use', async () => {
    const hold = holdCredits('openai/gpt-4o-mini');
    getCreditSnapshot.mockResolvedValue(snapshot({ total: hold }));
    expect((await POST(post({ messages })))!.status).toBe(200);

    runChappiAgent.mockClear();
    getCreditSnapshot.mockResolvedValue(snapshot({ total: hold - 1 }));
    expect((await POST(post({ messages })))!.status).toBe(429);
    expect(runChappiAgent).not.toHaveBeenCalled();
  });

  it('holds for the model the ROUTER chose, so a hard question needs more than a quick one', async () => {
    getCreditSnapshot.mockResolvedValue(snapshot({ total: holdCredits('openai/gpt-4o-mini') }));

    vi.stubEnv('AI_ROUTER', 'on');
    vi.stubEnv('AI_ROUTER_CEILING_MANAGER', 'pro');
    const hard = await POST(post({ messages: [{ id: 'm1', role: 'user', content: HEAVY }] }));
    expect(hard!.status).toBe(429);

    // The same balance is plenty for a short question, which starts on the quick rung.
    const easy = await POST(post({ messages }));
    expect(easy!.status).toBe(200);
  });

  it('does not enforce when the balance cannot be read, the way every other counter here fails open', async () => {
    getCreditSnapshot.mockResolvedValue(null);

    const response = await POST(post({ messages }));

    expect(response!.status).toBe(200);
    expect(runChappiAgent).toHaveBeenCalled();
    expect(settleTurn).not.toHaveBeenCalled();
  });

  it('does nothing about credits for a person with no team', async () => {
    team.value = { primaryWorkspaceId: null, ownerUserId: null, tier: 'manager', state: 'paid' };

    const response = await POST(post({ messages }));

    expect(response!.status).toBe(200);
    expect(getCreditSnapshot).not.toHaveBeenCalled();
    expect(settleTurn).not.toHaveBeenCalled();
  });
});
