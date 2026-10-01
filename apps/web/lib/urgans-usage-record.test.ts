import { beforeEach, describe, expect, it, vi } from 'vitest';

const logBillingEvent = vi.fn();

vi.mock('./billing-events-server', () => ({
  logBillingEvent: (...args: unknown[]) => logBillingEvent(...args),
  countBillingEventsSince: vi.fn(),
}));

import { recordUrgansAction } from './urgans-usage-server';

const client = {} as never;
const base = { workspaceId: 'ws-1', ownerUserId: 'owner-1', actorUserId: 'user-1' };

beforeEach(() => {
  logBillingEvent.mockReset();
  logBillingEvent.mockResolvedValue(true);
});

describe('recordUrgansAction', () => {
  it('records one urgans_action event with no metadata key when there is none, as it always has', async () => {
    await recordUrgansAction(client, base);

    expect(logBillingEvent).toHaveBeenCalledTimes(1);
    const input = logBillingEvent.mock.calls[0][1] as Record<string, unknown>;
    expect(input).toEqual({
      workspaceId: 'ws-1',
      ownerUserId: 'owner-1',
      actorUserId: 'user-1',
      type: 'urgans_action',
    });
    // Present-but-undefined would still serialise to a metadata key downstream.
    expect('metadata' in input).toBe(false);
  });

  it('carries routing metadata onto the same event without changing its type', async () => {
    await recordUrgansAction(client, { ...base, metadata: { routing: { end_tier: 'pro', models: ['openai/gpt-5.4'] } } });

    expect(logBillingEvent).toHaveBeenCalledTimes(1);
    const input = logBillingEvent.mock.calls[0][1] as Record<string, unknown>;
    // The monthly ceiling counts type 'urgans_action'. A different type here
    // would silently stop counting these turns.
    expect(input.type).toBe('urgans_action');
    expect(input.metadata).toEqual({ routing: { end_tier: 'pro', models: ['openai/gpt-5.4'] } });
  });
});
