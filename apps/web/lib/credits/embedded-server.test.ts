import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { beginEmbeddedRun, settleEmbeddedRun } from './embedded-server';
import { EMBEDDED_HOLD_CREDITS } from './embedded';
import type { UsageCall } from './pricing';

const credits = vi.hoisted(() => ({
  getCreditSnapshot: vi.fn(),
  settleTurn: vi.fn(),
}));
vi.mock('./credits-server', () => credits);

const admin = {} as SupabaseClient;
const team = { state: 'paid', tier: 'manager' };

const snapshot = (over: Record<string, unknown> = {}) => ({
  trial: 0,
  allowance: 300,
  topup: 0,
  total: 300,
  account: 'subscriber',
  monthlyAllowance: 660,
  referenceCredits: 660,
  nextGrantAt: '2026-11-01T00:00:00.000Z',
  ...over,
});

const CALLS: UsageCall[] = [{ model: 'openai/gpt-5.4', promptTokens: 6000, completionTokens: 2500, cachedTokens: 0 }];

beforeEach(() => {
  credits.getCreditSnapshot.mockReset();
  credits.settleTurn.mockReset();
  credits.getCreditSnapshot.mockResolvedValue(snapshot());
});
afterEach(() => vi.unstubAllEnvs());

describe('with credits off', () => {
  it('reads and charges nothing', async () => {
    const gate = await beginEmbeddedRun(admin, { workspaceId: 'ws', ownerUserId: 'o', team });
    expect(gate).toEqual({ metered: false });
    await settleEmbeddedRun(admin, {
      gate,
      workspaceId: 'ws',
      ownerUserId: 'o',
      actorUserId: 'u',
      requestId: 'r',
      actionId: 'release.draft_plan',
      calls: CALLS,
    });
    expect(credits.getCreditSnapshot).not.toHaveBeenCalled();
    expect(credits.settleTurn).not.toHaveBeenCalled();
  });
});

describe('with credits on', () => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_FEATURE_URGANS_CREDITS', 'true'));

  it('lets a run start on exactly the hold and not on one credit less', async () => {
    credits.getCreditSnapshot.mockResolvedValue(snapshot({ total: EMBEDDED_HOLD_CREDITS }));
    expect(await beginEmbeddedRun(admin, { workspaceId: 'ws', ownerUserId: 'o', team })).toMatchObject({ metered: true, ok: true });

    credits.getCreditSnapshot.mockResolvedValue(snapshot({ total: EMBEDDED_HOLD_CREDITS - 1 }));
    const refused = await beginEmbeddedRun(admin, { workspaceId: 'ws', ownerUserId: 'o', team });
    expect(refused).toMatchObject({ metered: true, ok: false });
  });

  it('tells a refused run what it needs, what the team has, and when the next credits arrive', async () => {
    credits.getCreditSnapshot.mockResolvedValue(snapshot({ total: 7 }));
    const refused = (await beginEmbeddedRun(admin, { workspaceId: 'ws', ownerUserId: 'o', team })) as { message: string };
    expect(refused.message).toContain('up to 25');
    expect(refused.message).toContain('you have 7');
    expect(refused.message).toContain('1 November');
  });

  it('does not hold a person with no team, or when the balance cannot be read', async () => {
    expect(await beginEmbeddedRun(admin, { workspaceId: null, ownerUserId: 'o', team })).toEqual({ metered: false });
    credits.getCreditSnapshot.mockResolvedValue(null);
    expect(await beginEmbeddedRun(admin, { workspaceId: 'ws', ownerUserId: 'o', team })).toEqual({ metered: false });
  });

  it('charges the real cost after a run, tagged as an embedded action, with the hold recorded', async () => {
    const gate = await beginEmbeddedRun(admin, { workspaceId: 'ws', ownerUserId: 'o', team });
    const charged = await settleEmbeddedRun(admin, {
      gate,
      workspaceId: 'ws',
      ownerUserId: 'o',
      actorUserId: 'u',
      requestId: 'embedded:abc',
      actionId: 'release.draft_plan',
      calls: CALLS,
    });

    expect(credits.settleTurn).toHaveBeenCalledTimes(1);
    const input = credits.settleTurn.mock.calls[0][1] as Record<string, unknown>;
    expect(input).toMatchObject({
      workspaceId: 'ws',
      requestId: 'embedded:abc',
      calls: CALLS,
      context: { source: 'embedded_action', action: 'release.draft_plan', hold_credits: 25, capped: false },
    });
    expect((input.charge as { credits: number }).credits).toBe(charged.credits);
    expect(charged.credits).toBeGreaterThan(0);
  });

  it('never settles above the hold and records what it would have cost', async () => {
    const gate = await beginEmbeddedRun(admin, { workspaceId: 'ws', ownerUserId: 'o', team });
    const huge: UsageCall[] = [{ model: 'openai/gpt-5.5', promptTokens: 100_000, completionTokens: 40_000, cachedTokens: 0 }];
    const charged = await settleEmbeddedRun(admin, {
      gate,
      workspaceId: 'ws',
      ownerUserId: 'o',
      actorUserId: 'u',
      requestId: 'r',
      actionId: 'release.draft_plan',
      calls: huge,
    });

    expect(charged.credits).toBe(25);
    const input = credits.settleTurn.mock.calls[0][1] as { charge: { credits: number }; context: Record<string, unknown> };
    expect(input.charge.credits).toBe(25);
    expect(input.context.capped).toBe(true);
    expect(input.context.uncapped_credits).toBeGreaterThan(25);
  });

  it('charges nothing for a run that made no model call', async () => {
    const gate = await beginEmbeddedRun(admin, { workspaceId: 'ws', ownerUserId: 'o', team });
    const charged = await settleEmbeddedRun(admin, {
      gate,
      workspaceId: 'ws',
      ownerUserId: 'o',
      actorUserId: 'u',
      requestId: 'r',
      actionId: 'release.draft_plan',
      calls: [],
    });
    expect(charged.credits).toBe(0);
    // settleTurn itself writes nothing for a zero charge, so being called is harmless; the charge is what matters.
  });

  it('does not charge a run whose gate was never opened', async () => {
    await settleEmbeddedRun(admin, {
      gate: { metered: false },
      workspaceId: 'ws',
      ownerUserId: 'o',
      actorUserId: 'u',
      requestId: 'r',
      actionId: 'release.draft_plan',
      calls: CALLS,
    });
    expect(credits.settleTurn).not.toHaveBeenCalled();
  });
});
