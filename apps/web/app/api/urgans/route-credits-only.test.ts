import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { startUnroutedTrace } from '@/lib/ai/model-router';
import { URGANS_PASS_HEADER } from '@/lib/urgans-pass-header';
import { requestHasUrgansPass } from '@/lib/urgans-pass-server';

// How /api/urgans treats a credits-only team (walled or read-only, so refused by
// the paywall, and admitted by the UrgAns gate). The point: the assistant's own
// tool calls get a UrgAns pass for such a team when it holds credits, and for
// nobody else, and the turn is metered like any other.

const access = vi.hoisted(() => ({ creditsOnly: null as null | { workspaceId: string; ownerUserId: string | null; funded: boolean } }));
const resolveChappiContext = vi.fn();
const runChappiAgent = vi.fn();
const getCreditSnapshot = vi.fn();
const settleTurn = vi.fn();
const team = vi.hoisted(() => ({
  value: { primaryWorkspaceId: 'ws-1', ownerUserId: 'owner-1', tier: 'label', state: 'walled' } as Record<string, unknown>,
}));

vi.mock('@/app/api/_shared/urgans-access', () => ({
  requireUrgansAccess: async () => ({
    user: { id: 'user-1', email: 'a@b.test' },
    supabaseUrl: 'https://supabase.test',
    adminClient: {},
    creditsOnly: access.creditsOnly,
  }),
}));
vi.mock('@/lib/chappi/config', () => ({
  isChappiEnabled: () => true,
  isChappiModelConfigured: () => true,
  getChappiModelConfig: () => ({ model: 'openai/gpt-4o-mini', apiKey: 'k', baseURL: 'https://gateway.test/v1' }),
}));
vi.mock('@/lib/chappi/dispatch', () => ({
  executeToolCall: vi.fn(),
  resolveChappiContext: (...args: unknown[]) => resolveChappiContext(...args),
}));
vi.mock('@/lib/chappi/runner', () => ({
  runChappiAgent: (...args: unknown[]) => runChappiAgent(...args),
  closeConfirmedAction: vi.fn(),
}));
vi.mock('@/lib/chappi/system-prompt', () => ({
  buildChappiSystemPrompt: async () => ({ prompt: 'system prompt', briefSections: [] }),
}));
vi.mock('@/lib/team-billing-server', () => ({ getTeamAccessForUser: async () => team.value }));
vi.mock('@/lib/urgans-usage-server', () => ({
  checkUrgansAllowance: vi.fn(),
  recordUrgansAction: vi.fn(),
}));
vi.mock('@/lib/seats-server', () => ({ recordLimitHit: vi.fn() }));
vi.mock('@/lib/billing-events-server', () => ({ logBillingEvent: vi.fn() }));
vi.mock('@/lib/credits/credits-server', () => ({
  getCreditSnapshot: (...args: unknown[]) => getCreditSnapshot(...args),
  settleTurn: (...args: unknown[]) => settleTurn(...args),
}));

import { POST } from './route';

const post = () =>
  new NextRequest('https://app.test/api/urgans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt' },
    body: JSON.stringify({ messages: [{ id: 'm1', role: 'user', content: 'add a task to Midnight EP' }] }),
  });

const snapshot = (total: number) => ({
  trial: 0,
  allowance: 0,
  topup: total,
  total,
  account: 'credits_only',
  monthlyAllowance: 0,
  referenceCredits: 50,
  nextGrantAt: null,
});

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_URGANS_CREDITS', 'true');
  for (const mock of [resolveChappiContext, runChappiAgent, getCreditSnapshot, settleTurn]) mock.mockReset();
  resolveChappiContext.mockResolvedValue({ user: { id: 'user-1' }, workspaceIds: ['ws-1'] });
  runChappiAgent.mockResolvedValue({
    reply: 'done',
    clientActions: [],
    pendingConfirmation: null,
    trace: startUnroutedTrace('chat', 'openai/gpt-4o-mini'),
    usageCalls: [{ model: 'openai/gpt-4o-mini', promptTokens: 10_000, completionTokens: 100, cachedTokens: 0 }],
  });
  getCreditSnapshot.mockResolvedValue(snapshot(40));
  access.creditsOnly = { workspaceId: 'ws-1', ownerUserId: 'owner-1', funded: true };
  team.value = { primaryWorkspaceId: 'ws-1', ownerUserId: 'owner-1', tier: 'label', state: 'walled' };
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const passGiven = (): string | undefined => (resolveChappiContext.mock.calls[0][0] as { urgansPass?: string }).urgansPass;

describe('a funded credits-only team', () => {
  it('gets an AI pass for its assistant, minted for that user', async () => {
    const response = await POST(post());
    expect(response!.status).toBe(200);
    const pass = passGiven();
    expect(pass).toBeTruthy();
    const header = { headers: { get: (name: string) => (name === URGANS_PASS_HEADER ? (pass as string) : null) } };
    expect(requestHasUrgansPass(header, 'user-1')).toBe(true);
    expect(requestHasUrgansPass(header, 'user-2')).toBe(false);
  });

  it('is metered like any other turn', async () => {
    await POST(post());
    expect(settleTurn).toHaveBeenCalledTimes(1);
    expect(settleTurn.mock.calls[0][1]).toMatchObject({ workspaceId: 'ws-1', ownerUserId: 'owner-1', actorUserId: 'user-1' });
  });

  it('is told to buy more, and not that quick commands work, when its credits run out', async () => {
    getCreditSnapshot.mockResolvedValue(snapshot(0));
    const response = await POST(post());
    expect(response!.status).toBe(429);
    const body = await response!.json();
    expect(body.mode).toBe('deterministic');
    expect(body.notice).toContain('out of AI credits');
    expect(body.notice).not.toContain('Quick commands');
    expect(runChappiAgent).not.toHaveBeenCalled();
    expect(settleTurn).not.toHaveBeenCalled();
  });
});

describe('nobody else gets a pass', () => {
  it('not a credits-only team with no credits', async () => {
    access.creditsOnly = { workspaceId: 'ws-1', ownerUserId: 'owner-1', funded: false };
    await POST(post());
    expect(passGiven()).toBeUndefined();
  });

  it('not a team the normal gate admitted', async () => {
    access.creditsOnly = null;
    team.value = { primaryWorkspaceId: 'ws-1', ownerUserId: 'owner-1', tier: 'manager', state: 'paid' };
    getCreditSnapshot.mockResolvedValue({ ...snapshot(500), account: 'subscriber' });
    await POST(post());
    expect(passGiven()).toBeUndefined();
  });

  it('and no pass is minted at all when the server has no key', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    await POST(post());
    expect(passGiven() ?? '').toBe('');
  });
});
