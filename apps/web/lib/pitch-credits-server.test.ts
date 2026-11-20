import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const notifyUser = vi.fn(async () => {});
vi.mock('@/lib/pitch-payments-server', () => ({ notifyUser: (...args: unknown[]) => notifyUser(...(args as [])) }));
vi.mock('@/lib/team-billing-server', () => ({ getTeamAccessForUser: vi.fn() }));
vi.mock('@/lib/credits/credits-server', () => ({ getCreditSnapshot: vi.fn() }));
const notifyCuratorOfNewPitch = vi.fn(async () => {});
vi.mock('@/lib/pitch-submission-notice-server', () => ({
  notifyCuratorOfNewPitch: (...args: unknown[]) => notifyCuratorOfNewPitch(...(args as [])),
}));

import {
  isMissingSchema,
  notifyCuratorsOfCreditPitches,
  runCreditPitchSweep,
  sendCreditPitches,
} from './pitch-credits-server';

/**
 * A tiny stand-in for the Supabase client: every query chain resolves to what
 * the test queued for that table, and rpc() answers per function name. Enough
 * to drive the send mapping and the sweep without a database (the SQL itself is
 * exercised against Postgres separately, see the migration's header).
 */
function fakeAdmin(options: {
  tables?: Record<string, Array<{ data: unknown; error?: unknown }>>;
  rpc?: Record<string, (args: Record<string, unknown>) => { data: unknown; error?: unknown }>;
}) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const queues = Object.fromEntries(Object.entries(options.tables ?? {}).map(([k, v]) => [k, [...v]]));
  const chain = (table: string) => {
    const take = () => {
      const next = queues[table]?.shift();
      return Promise.resolve({ data: next?.data ?? null, error: next?.error ?? null });
    };
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'is', 'lte', 'gt', 'order', 'limit', 'update', 'not']) {
      builder[method] = () => builder;
    }
    builder.maybeSingle = take;
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => take().then(resolve, reject);
    return builder;
  };
  const client = {
    from: (table: string) => chain(table),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      const handler = options.rpc?.[name];
      if (!handler) return { data: null, error: { code: 'PGRST202', message: 'not found' } };
      const out = handler(args);
      return { data: out.data, error: out.error ?? null };
    },
  };
  return { client: client as unknown as SupabaseClient, rpcCalls };
}

const ITEM = {
  playlist_id: 'pl-1',
  release_id: 'rel-1',
  release_owner_id: 'owner-1',
  pitcher_name: 'Kola',
  song_title: 'Midnight Run',
  artist_name: 'Kola Dare',
  song_url: 'https://untitled.stream/x',
  song_platform: 'other',
  note: 'hi',
  curator_name: 'Tobi',
};

beforeEach(() => notifyUser.mockClear());

describe('sendCreditPitches', () => {
  it('sends with the request id, the 7-day window and the waiting cap', async () => {
    const { client, rpcCalls } = fakeAdmin({
      rpc: {
        send_credit_pitches: () => ({
          data: { result: 'sent', pitch_ids: ['p1'], charged: 100, balance_after: 460, replayed: 0 },
        }),
      },
    });
    const out = await sendCreditPitches(client, {
      workspaceId: 'ws-1',
      ownerUserId: 'owner-1',
      actorUserId: 'user-1',
      requestId: 'req-abc12345',
      items: [ITEM],
    });
    expect(out).toEqual({ result: 'sent', pitchIds: ['p1'], charged: 100, balanceAfter: 460 });
    expect(rpcCalls[0].args).toMatchObject({
      p_workspace: 'ws-1',
      p_request: 'req-abc12345',
      p_reply_days: 7,
      p_waiting_limit: 10,
    });
  });

  it('passes an insufficient balance through with what is short', async () => {
    const { client } = fakeAdmin({
      rpc: { send_credit_pitches: () => ({ data: { result: 'insufficient', needed: 300, balance: 120, short: 180 } }) },
    });
    const out = await sendCreditPitches(client, {
      workspaceId: 'ws-1',
      ownerUserId: null,
      actorUserId: 'user-1',
      requestId: 'req-abc12345',
      items: [ITEM],
    });
    expect(out).toEqual({ result: 'insufficient', needed: 300, balance: 120, short: 180 });
  });

  it('a replayed request is reported as sent with nothing charged (dedupe)', async () => {
    const { client } = fakeAdmin({
      rpc: {
        send_credit_pitches: () => ({ data: { result: 'sent', pitch_ids: ['p1'], charged: 0, balance_after: 460, replayed: 1 } }),
      },
    });
    const out = await sendCreditPitches(client, {
      workspaceId: 'ws-1',
      ownerUserId: null,
      actorUserId: 'user-1',
      requestId: 'req-abc12345',
      items: [ITEM],
    });
    expect(out).toMatchObject({ result: 'sent', charged: 0 });
  });

  it('a database without the migration is "unmigrated", never a crash', async () => {
    const { client } = fakeAdmin({});
    const out = await sendCreditPitches(client, {
      workspaceId: 'ws-1',
      ownerUserId: null,
      actorUserId: 'user-1',
      requestId: 'req-abc12345',
      items: [ITEM],
    });
    expect(out).toEqual({ result: 'unmigrated' });
  });

  it('knows which errors mean "no migration yet"', () => {
    expect(isMissingSchema({ code: '42703' })).toBe(true);
    expect(isMissingSchema({ code: 'PGRST202' })).toBe(true);
    expect(isMissingSchema({ code: '23505' })).toBe(false);
    expect(isMissingSchema(null)).toBe(false);
  });
});

describe('runCreditPitchSweep', () => {
  it('refunds a missed pitch through expire_credit_pitch and tells both sides', async () => {
    const { client, rpcCalls } = fakeAdmin({
      tables: {
        playlist_pitches: [
          { data: [{ id: 'p1' }] }, // due
          { data: { id: 'p1', curator_user_id: 'c1', created_by: 'u1', artist_name: 'Kola', release_id: 'rel-1' } }, // notice
          { data: [] }, // reminders
        ],
        curator_profiles: [{ data: { display_name: 'Tobi' } }],
      },
      rpc: {
        expire_credit_pitch: () => ({
          data: { result: 'expired', credits_refunded: 100, curator_user_id: 'c1', created_by: 'u1', strike_count: 1, paused: false },
        }),
      },
    });
    const now = new Date('2026-10-24T12:15:00Z');
    const result = await runCreditPitchSweep(client, now);
    expect(result).toMatchObject({ expired: 1, creditsRefunded: 100, paused: 0, errors: [] });
    expect(rpcCalls[0]).toMatchObject({
      name: 'expire_credit_pitch',
      args: { p_pitch_id: 'p1', p_now: now.toISOString(), p_strike_limit: 3, p_strike_window_days: 90 },
    });
    const bodies = notifyUser.mock.calls.map((call) => (call as unknown as [unknown, unknown, { body: string }])[2].body);
    expect(bodies).toContain("Tobi didn't reply in time. Your 100 credits are back.");
    expect(bodies.some((body) => body.includes('Strike 1 of 3'))).toBe(true);
  });

  it('does nothing more when the database says the pitch is not due (re-run, or answered)', async () => {
    const { client } = fakeAdmin({
      tables: { playlist_pitches: [{ data: [{ id: 'p1' }] }, { data: [] }] },
      rpc: { expire_credit_pitch: () => ({ data: { result: 'not_due', status: 'expired' } }) },
    });
    const result = await runCreditPitchSweep(client);
    expect(result.expired).toBe(0);
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it('sends the one-day reminder in naira, once', async () => {
    const { client } = fakeAdmin({
      tables: {
        playlist_pitches: [
          { data: [] }, // nothing due
          { data: [{ id: 'p2' }] }, // reminders due
          { data: { id: 'p2', curator_user_id: 'c1', artist_name: 'Kola', credits_charged: 250 } }, // claimed
        ],
      },
    });
    const result = await runCreditPitchSweep(client);
    expect(result.reminders).toBe(1);
    const notice = (notifyUser.mock.calls[0] as unknown as [unknown, string, { body: string }])[2];
    expect(notice.body).toBe('1 day left to reply to Kola. Reply in time to earn ₦2,500.');
  });
});

describe('notifyCuratorsOfCreditPitches', () => {
  beforeEach(() => {
    notifyUser.mockClear();
    notifyCuratorOfNewPitch.mockClear();
  });

  // The bug of 2026-11-20: every playlist starts on the Free tier, so the
  // pitches this send writes are mostly payment_kind 'free', and those were
  // skipped, so the playlist owner was never emailed.
  it('tells the curator about a Free-tier pitch, with the free pitch notice', async () => {
    const { client } = fakeAdmin({
      tables: {
        playlist_pitches: [
          {
            data: {
              id: 'p-free',
              curator_user_id: 'cur-1',
              song_title: 'Midnight Run',
              artist_name: 'Kola Dare',
              payment_kind: 'free',
              credits_charged: 0,
            },
          },
        ],
      },
    });
    await notifyCuratorsOfCreditPitches(client, ['p-free']);
    expect(notifyCuratorOfNewPitch).toHaveBeenCalledTimes(1);
    expect(notifyCuratorOfNewPitch).toHaveBeenCalledWith(client, 'p-free');
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it('tells the curator about a credit pitch with what they earn, once per pitch', async () => {
    const { client } = fakeAdmin({
      tables: {
        playlist_pitches: [
          {
            data: {
              id: 'p-paid',
              curator_user_id: 'cur-2',
              song_title: 'Midnight Run',
              artist_name: 'Kola Dare',
              payment_kind: 'credits',
              credits_charged: 3,
            },
          },
        ],
      },
    });
    await notifyCuratorsOfCreditPitches(client, ['p-paid']);
    expect(notifyCuratorOfNewPitch).not.toHaveBeenCalled();
    expect(notifyUser).toHaveBeenCalledTimes(1);
    const [, userId, notice] = notifyUser.mock.calls[0] as unknown as [unknown, string, Record<string, unknown>];
    expect(userId).toBe('cur-2');
    expect(notice.trigger).toBe('pitch_paid');
    expect(notice.dedupeKey).toBe('pitch-credits-p-paid');
  });

  it('tells every curator in a mixed send, and skips a pitch that is gone', async () => {
    const row = (id: string, kind: string) => ({
      data: { id, curator_user_id: `cur-${id}`, song_title: 's', artist_name: 'a', payment_kind: kind, credits_charged: kind === 'credits' ? 2 : 0 },
    });
    const { client } = fakeAdmin({
      tables: { playlist_pitches: [row('a', 'free'), { data: null }, row('c', 'credits'), row('d', 'free')] },
    });
    await notifyCuratorsOfCreditPitches(client, ['a', 'b', 'c', 'd']);
    expect(notifyCuratorOfNewPitch.mock.calls.map((call) => (call as unknown as [unknown, string])[1])).toEqual(['a', 'd']);
    expect(notifyUser).toHaveBeenCalledTimes(1);
  });
});
