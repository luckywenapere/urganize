import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The assistant action ceiling. Three properties are load-bearing and none of
// them is obvious from reading the handler top to bottom, which is why they are
// pinned here:
//
//   1. Approving a permission card is NEVER billed, even for a team that is
//      already over its ceiling. That path calls the model (closeConfirmedAction
//      writes the closing line), so a check placed one block earlier would
//      charge a user an action for clicking Approve — and would refuse to
//      finish an action they had already authorised.
//   2. At the ceiling the client falls back to the DETERMINISTIC router rather
//      than getting an error. That path makes no model call, costs nothing, and
//      is already what production serves whenever no model is configured, so a
//      capped team can still create releases and activities by typing.
//   3. A failed turn is not charged.

const runChappiAgent = vi.fn();
const closeConfirmedAction = vi.fn();
const executeToolCall = vi.fn();
const checkUrgansAllowance = vi.fn();
const recordUrgansAction = vi.fn();
const recordLimitHit = vi.fn();

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
  getTeamAccessForUser: async () => ({
    primaryWorkspaceId: 'ws-1',
    ownerUserId: 'owner-1',
    tier: 'manager',
  }),
}));

vi.mock('@/lib/urgans-usage-server', () => ({
  checkUrgansAllowance: (...args: unknown[]) => checkUrgansAllowance(...args),
  recordUrgansAction: (...args: unknown[]) => recordUrgansAction(...args),
}));

vi.mock('@/lib/seats-server', () => ({
  recordLimitHit: (...args: unknown[]) => recordLimitHit(...args),
}));

import { POST } from './route';

function post(body: Record<string, unknown>) {
  return new NextRequest('https://app.test/api/urgans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt' },
    body: JSON.stringify(body),
  });
}

const messages = [{ id: 'm1', role: 'user', content: 'what is due this week' }];

const ALLOWED = { allowed: true, limit: 150, current: 3, remaining: 147 };
const REFUSED = {
  allowed: false,
  key: 'urgans_monthly_actions',
  limit: 150,
  current: 150,
  message: 'You have used all 150 AI actions on your plan this month.',
  upgradeTo: 'label',
};

beforeEach(() => {
  runChappiAgent.mockReset();
  closeConfirmedAction.mockReset();
  executeToolCall.mockReset();
  checkUrgansAllowance.mockReset();
  recordUrgansAction.mockReset();
  recordLimitHit.mockReset();

  runChappiAgent.mockResolvedValue({ reply: 'ok', clientActions: [], pendingConfirmation: null });
  checkUrgansAllowance.mockResolvedValue(ALLOWED);
});

describe('POST /api/urgans — the action ceiling', () => {
  it('runs the turn and records exactly one action when under the ceiling', async () => {
    const response = await POST(post({ messages }));
    const body = await response!.json();

    expect(response!.status).toBe(200);
    expect(body.mode).toBe('agent');
    expect(runChappiAgent).toHaveBeenCalledTimes(1);
    // One per TURN, not per gateway round — runChappiAgent loops internally.
    expect(recordUrgansAction).toHaveBeenCalledTimes(1);
    expect(recordUrgansAction.mock.calls[0][1]).toEqual({
      workspaceId: 'ws-1',
      ownerUserId: 'owner-1',
      actorUserId: 'user-1',
    });
    expect(recordLimitHit).not.toHaveBeenCalled();
  });

  it('falls back to the deterministic router at the ceiling, and does not bill', async () => {
    checkUrgansAllowance.mockResolvedValue(REFUSED);

    const response = await POST(post({ messages }));
    const body = await response!.json();

    // Deterministic, NOT an error: the keyword router and action chips still
    // work, so the assistant degrades rather than going dark.
    expect(body.mode).toBe('deterministic');
    expect(body.notice).toBe(REFUSED.message);
    // 429 is not emitted anywhere else in this route (an upstream 429 is mapped
    // down to 503), so it unambiguously means "your ceiling".
    expect(response!.status).toBe(429);

    expect(runChappiAgent).not.toHaveBeenCalled();
    expect(recordUrgansAction).not.toHaveBeenCalled();
    expect(recordLimitHit).toHaveBeenCalledTimes(1);
    expect(recordLimitHit.mock.calls[0][1]).toMatchObject({
      key: 'urgans_monthly_actions',
      limit: 150,
      current: 150,
    });
  });

  it('never bills or blocks the confirmation replay, even over the ceiling', async () => {
    checkUrgansAllowance.mockResolvedValue(REFUSED);
    executeToolCall.mockResolvedValue({ ok: true, summary: 'Deleted the release.' });
    closeConfirmedAction.mockResolvedValue('Done — that release is gone.');

    const response = await POST(
      post({
        messages,
        confirmedAction: { toolName: 'delete_release', args: { releaseId: 'r1' } },
      })
    );
    const body = await response!.json();

    expect(response!.status).toBe(200);
    expect(body.mode).toBe('agent');
    expect(executeToolCall).toHaveBeenCalledTimes(1);
    // The ceiling is not even consulted on this path.
    expect(checkUrgansAllowance).not.toHaveBeenCalled();
    expect(recordUrgansAction).not.toHaveBeenCalled();
    expect(recordLimitHit).not.toHaveBeenCalled();
  });

  it('does not charge a turn the gateway failed to complete', async () => {
    runChappiAgent.mockRejectedValue(new Error('AI is unavailable right now.'));

    const response = await POST(post({ messages }));

    expect(response!.status).toBe(503);
    expect(recordUrgansAction).not.toHaveBeenCalled();
  });
});
