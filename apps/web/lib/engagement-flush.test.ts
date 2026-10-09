import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const sendPushToUsers = vi.fn();
vi.mock('@/lib/push-server', () => ({
  sendPushToUsers: (...args: unknown[]) => sendPushToUsers(...args),
}));

import { flushDueNotifications } from '@/lib/engagement-server';

/**
 * The scheduled-push flush stops on a clock (2026-10-09, v1.92.11).
 *
 * Before, a stuck push held the morning cron until the platform killed it and
 * the email outbox, which runs after it, never got a turn.
 */

type Row = { id: string; user_id: string; kind: string; title: string; body: string; url: string };

function dueRows(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `row-${i}`,
    user_id: `user-${i}`,
    kind: 'comeback_1d',
    title: 'Hi',
    body: 'Come back',
    url: '/dashboard',
  }));
}

/** A stand-in for the two queries the flush makes: the due read and the claim. */
function fakeAdmin(rows: Row[], options: { claimable?: (id: string) => boolean } = {}) {
  const claimed: string[] = [];
  const claimable = options.claimable ?? (() => true);
  const client = {
    from() {
      return {
        select: () => ({
          is: () => ({
            is: () => ({
              lte: () => ({
                order: () => ({
                  limit: async () => ({ data: rows, error: null }),
                }),
              }),
            }),
          }),
        }),
        update: () => ({
          eq: (_column: string, id: string) => ({
            is: () => ({
              select: () => ({
                maybeSingle: async () => {
                  if (!claimable(id)) return { data: null, error: null };
                  claimed.push(id);
                  return { data: { id }, error: null };
                },
              }),
            }),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
  return { client, claimed };
}

beforeEach(() => {
  sendPushToUsers.mockReset();
  sendPushToUsers.mockResolvedValue({ sent: 1, pruned: 0 });
  vi.useRealTimers();
});

describe('flushDueNotifications', () => {
  it('sends every due row and counts the ones that reached a device', async () => {
    const { client, claimed } = fakeAdmin(dueRows(7));
    const result = await flushDueNotifications(client, 50);
    expect(result).toEqual({ processed: 7, delivered: 7 });
    expect(claimed).toHaveLength(7);
    expect(sendPushToUsers).toHaveBeenCalledTimes(7);
  });

  it('counts a send with no device as processed but not delivered', async () => {
    sendPushToUsers.mockResolvedValue({ sent: 0, pruned: 0 });
    const { client } = fakeAdmin(dueRows(3));
    expect(await flushDueNotifications(client, 50)).toEqual({ processed: 3, delivered: 0 });
  });

  it('claims a row before it sends, and skips a row somebody else already claimed', async () => {
    const { client } = fakeAdmin(dueRows(3), { claimable: (id) => id !== 'row-1' });
    const result = await flushDueNotifications(client, 50);
    expect(sendPushToUsers).toHaveBeenCalledTimes(2);
    const sentTo = sendPushToUsers.mock.calls.map((call) => (call[1] as string[])[0]);
    expect(sentTo).not.toContain('user-1');
    expect(result.delivered).toBe(2);
  });

  it('tags each push by its kind so different reminders do not replace each other', async () => {
    const { client } = fakeAdmin(dueRows(1));
    await flushDueNotifications(client, 50);
    expect(sendPushToUsers.mock.calls[0][2]).toMatchObject({ tag: 'urganize-comeback_1d' });
  });

  it('sends no more than five at the same moment', async () => {
    let inFlight = 0;
    let peak = 0;
    sendPushToUsers.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { sent: 1, pruned: 0 };
    });
    const { client } = fakeAdmin(dueRows(23));
    await flushDueNotifications(client, 50);
    expect(peak).toBeLessThanOrEqual(5);
    expect(peak).toBeGreaterThan(1);
  });

  it('stops starting new sends once its time is spent and leaves the rest unclaimed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T07:00:00Z'));
    let calls = 0;
    sendPushToUsers.mockImplementation(async () => {
      // Each group of five takes ten seconds, as a stuck push service would:
      // the clock moves once per group, on the first send of it.
      if (calls % 5 === 0) vi.setSystemTime(new Date(Date.now() + 10_000));
      calls += 1;
      return { sent: 1, pruned: 0 };
    });
    const { client, claimed } = fakeAdmin(dueRows(20));
    const result = await flushDueNotifications(client, 50, { timeBudgetMs: 15_000 });
    // Groups of five: two groups start (0s, 10s), the third sees 20s > 15s and stops.
    expect(result.processed).toBe(10);
    expect(claimed).toHaveLength(10);
    expect(claimed).not.toContain('row-10');
  });

  it('uses a default budget so an unconfigured caller is still bounded', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T07:00:00Z'));
    sendPushToUsers.mockImplementation(async () => {
      vi.setSystemTime(new Date(Date.now() + 8_000));
      return { sent: 1, pruned: 0 };
    });
    const { client } = fakeAdmin(dueRows(50));
    const result = await flushDueNotifications(client, 50);
    expect(result.processed).toBeLessThan(50);
    expect(result.processed).toBeGreaterThan(0);
  });

  it('a budget of zero sends nothing', async () => {
    const { client } = fakeAdmin(dueRows(5));
    const result = await flushDueNotifications(client, 50, { timeBudgetMs: -1 });
    expect(result).toEqual({ processed: 0, delivered: 0 });
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it('one send that throws does not lose the counts of the others', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let n = 0;
    sendPushToUsers.mockImplementation(async () => {
      n += 1;
      if (n === 2) throw new Error('push service fell over');
      return { sent: 1, pruned: 0 };
    });
    const { client } = fakeAdmin(dueRows(4));
    const result = await flushDueNotifications(client, 50);
    expect(result).toEqual({ processed: 4, delivered: 3 });
    errors.mockRestore();
  });

  it('answers with zeros, and never throws, when the read fails', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = {
      from() {
        throw new Error('database down');
      },
    } as unknown as SupabaseClient;
    expect(await flushDueNotifications(client, 50)).toEqual({ processed: 0, delivered: 0 });
    errors.mockRestore();
  });
});
