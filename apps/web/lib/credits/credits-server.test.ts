import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { adjustCredits, ensureAllowance, getCreditSnapshot, readBalances, settleTurn } from './credits-server';
import { turnCharge, type UsageCall } from './pricing';

// The anchor read is its own query on another table; it has its own tests. Here
// it is just "the billing day", set per test.
const anchor = vi.hoisted(() => ({ value: null as string | null }));
vi.mock('@/lib/urgans-usage-server', () => ({ readBillingAnchor: async () => anchor.value }));

type Row = Record<string, unknown>;

/**
 * A recording fake of the two calls this module makes. It enforces the ledger's
 * unique dedupe_key the way the real index does (a repeat insert fails with
 * 23505) and can be told to fail, so the paths a test cannot reach against a real
 * database are exercised here.
 */
function fakeClient(opts: { rpc?: () => { data: unknown; error: { message: string } | null }; insertError?: { code?: string; message: string } } = {}) {
  const inserted: Row[] = [];
  const keys = new Set<string>();
  const client = {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe('credit_balances');
      void args;
      return opts.rpc ? opts.rpc() : { data: [{ allowance: 0, topup: 0 }], error: null };
    }),
    from: vi.fn((table: string) => {
      expect(table).toBe('credit_ledger');
      return {
        insert: async (row: Row) => {
          if (opts.insertError) return { error: opts.insertError };
          const key = row.dedupe_key as string | undefined;
          if (key && keys.has(key)) return { error: { code: '23505', message: 'duplicate key value' } };
          if (key) keys.add(key);
          inserted.push(row);
          return { error: null };
        },
      };
    }),
  };
  return { client: client as unknown as SupabaseClient, inserted, rpc: client.rpc };
}

const CALLS: UsageCall[] = [
  { model: 'openai/gpt-4o-mini', promptTokens: 10_800, completionTokens: 80, cachedTokens: 0 },
  { model: 'openai/gpt-4o-mini', promptTokens: 11_400, completionTokens: 350, cachedTokens: 10_800 },
];

beforeEach(() => {
  anchor.value = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('readBalances', () => {
  it('reads both pools and adds them up', async () => {
    const { client, rpc } = fakeClient({ rpc: () => ({ data: [{ allowance: 120, topup: 30 }], error: null }) });
    expect(await readBalances(client, 'ws-1', '2026-10-01')).toEqual({ allowance: 120, topup: 30, total: 150 });
    expect(rpc).toHaveBeenCalledWith('credit_balances', { p_workspace: 'ws-1', p_window: '2026-10-01' });
  });

  it('reads the numbers Postgres sends for a bigint, which arrive as strings', async () => {
    const { client } = fakeClient({ rpc: () => ({ data: [{ allowance: '120', topup: '-4' }], error: null }) });
    expect(await readBalances(client, 'ws-1', '2026-10-01')).toEqual({ allowance: 120, topup: -4, total: 116 });
  });

  it('accepts a single object as well as a one-row array', async () => {
    const { client } = fakeClient({ rpc: () => ({ data: { allowance: 5, topup: 1 }, error: null }) });
    expect((await readBalances(client, 'ws-1', '2026-10-01'))?.total).toBe(6);
  });

  it('is zero for a team with no rows, which is not the same as unreadable', async () => {
    const { client } = fakeClient({ rpc: () => ({ data: [], error: null }) });
    expect(await readBalances(client, 'ws-1', '2026-10-01')).toEqual({ allowance: 0, topup: 0, total: 0 });
  });

  it('is null when it cannot be read, so callers can tell the difference and not enforce', async () => {
    const failing = fakeClient({ rpc: () => ({ data: null, error: { message: 'boom' } }) });
    expect(await readBalances(failing.client, 'ws-1', '2026-10-01')).toBeNull();

    const throwing = fakeClient({
      rpc: () => {
        throw new Error('network');
      },
    });
    expect(await readBalances(throwing.client, 'ws-1', '2026-10-01')).toBeNull();
  });
});

describe('ensureAllowance', () => {
  const input = { workspaceId: 'ws-1', ownerUserId: 'owner-1', windowStart: '2026-10-01', credits: 660 };

  it('writes the window\'s allowance to the allowance pool with a key that makes it happen once', async () => {
    const { client, inserted } = fakeClient();
    expect(await ensureAllowance(client, input)).toBe(true);
    expect(inserted).toEqual([
      expect.objectContaining({
        workspace_id: 'ws-1',
        owner_user_id: 'owner-1',
        pool: 'allowance',
        kind: 'allowance',
        credits: 660,
        window_start: '2026-10-01',
        dedupe_key: 'allowance:ws-1:2026-10-01',
      }),
    ]);
  });

  it('is granted once however many times it is asked: the repeat hits the unique key and counts as fine', async () => {
    const { client, inserted } = fakeClient();
    await ensureAllowance(client, input);
    expect(await ensureAllowance(client, input)).toBe(true);
    expect(await ensureAllowance(client, input)).toBe(true);
    expect(inserted).toHaveLength(1);
  });

  it('grants again in the next window, because its key names the window', async () => {
    const { client, inserted } = fakeClient();
    await ensureAllowance(client, input);
    await ensureAllowance(client, { ...input, windowStart: '2026-11-01' });
    expect(inserted.map((row) => row.dedupe_key)).toEqual(['allowance:ws-1:2026-10-01', 'allowance:ws-1:2026-11-01']);
  });

  it('says so, and does not throw, when it could not be written', async () => {
    const { client } = fakeClient({ insertError: { code: '42501', message: 'denied' } });
    expect(await ensureAllowance(client, input)).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('getCreditSnapshot', () => {
  const base = { workspaceId: 'ws-1', ownerUserId: 'owner-1', now: new Date('2026-10-15T09:00:00Z') };

  it('grants the plan\'s allowance for the window and reads the balances', async () => {
    const { client, inserted } = fakeClient({ rpc: () => ({ data: [{ allowance: 660, topup: 40 }], error: null }) });
    const snap = await getCreditSnapshot(client, { ...base, team: { state: 'paid', tier: 'manager' } });

    expect(inserted[0]).toMatchObject({ credits: 660, window_start: '2026-10-01' });
    expect(snap).toEqual({
      allowance: 660,
      topup: 40,
      total: 700,
      monthlyAllowance: 660,
      windowStart: '2026-10-01',
      resetsAt: '2026-11-01T00:00:00.000Z',
    });
  });

  it('gives a trial the small allowance even though its tier reads as the biggest', async () => {
    const { client, inserted } = fakeClient();
    await getCreditSnapshot(client, { ...base, team: { state: 'trial', tier: 'label' } });
    expect(inserted[0]).toMatchObject({ credits: 150 });
  });

  it('puts the window on the billing day, not the first of the month', async () => {
    anchor.value = '2026-03-12T00:00:00.000Z';
    const { client, inserted } = fakeClient();
    const snap = await getCreditSnapshot(client, { ...base, team: { state: 'paid', tier: 'solo' } });

    expect(snap?.windowStart).toBe('2026-10-12');
    expect(snap?.resetsAt).toBe('2026-11-12T00:00:00.000Z');
    expect(inserted[0]).toMatchObject({ credits: 150, window_start: '2026-10-12' });
  });

  it('is null when the balance cannot be read', async () => {
    const { client } = fakeClient({ rpc: () => ({ data: null, error: { message: 'boom' } }) });
    expect(await getCreditSnapshot(client, { ...base, team: { state: 'paid', tier: 'solo' } })).toBeNull();
  });
});

describe('settleTurn', () => {
  const charge = turnCharge(CALLS);
  const base = {
    workspaceId: 'ws-1',
    ownerUserId: 'owner-1',
    actorUserId: 'user-1',
    requestId: 'req-1',
    windowStart: '2026-10-01',
    charge,
    calls: CALLS,
  };

  it('charges a turn the allowance covers to the allowance pool only, as a negative amount', async () => {
    const { client, inserted } = fakeClient();
    await settleTurn(client, { ...base, balances: { allowance: 100, topup: 50, total: 150 } });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      pool: 'allowance',
      kind: 'spend',
      credits: -charge.credits,
      window_start: '2026-10-01',
      dedupe_key: 'spend:req-1:allowance',
      workspace_id: 'ws-1',
      actor_user_id: 'user-1',
    });
  });

  it('splits across both pools when the allowance runs out mid-turn, and the halves add up to the charge', async () => {
    const { client, inserted } = fakeClient();
    const big = turnCharge([{ model: 'openai/gpt-5.4', promptTokens: 12_000, completionTokens: 1500, cachedTokens: 0 }]);
    expect(big.credits).toBeGreaterThan(6);

    await settleTurn(client, { ...base, charge: big, balances: { allowance: 5, topup: 100, total: 105 } });

    const [fromAllowance, fromTopup] = inserted;
    expect(fromAllowance).toMatchObject({ pool: 'allowance', credits: -5, dedupe_key: 'spend:req-1:allowance' });
    expect(fromTopup).toMatchObject({ pool: 'topup', credits: -(big.credits - 5), dedupe_key: 'spend:req-1:topup' });
    expect('window_start' in fromTopup).toBe(false);
    expect((fromAllowance.credits as number) + (fromTopup.credits as number)).toBe(-big.credits);
  });

  it('shares the provider cost between the rows in proportion, so the ledger sums to what the bill was', async () => {
    const { client, inserted } = fakeClient();
    const big = turnCharge([{ model: 'openai/gpt-5.4', promptTokens: 12_000, completionTokens: 1500, cachedTokens: 0 }]);
    await settleTurn(client, { ...base, charge: big, balances: { allowance: 5, topup: 100, total: 105 } });

    const total = inserted.reduce((sum, row) => sum + (row.provider_cost_rodi as number), 0);
    expect(total).toBeCloseTo(big.rodi, 2);
  });

  it('puts an overshoot on the top-up pool, where it can be seen and repaid', async () => {
    const { client, inserted } = fakeClient();
    await settleTurn(client, { ...base, balances: { allowance: 0, topup: 0, total: 0 } });
    expect(inserted).toEqual([expect.objectContaining({ pool: 'topup', credits: -charge.credits })]);
  });

  it('records what the turn used on the row, for checking a charge against the bill', async () => {
    const { client, inserted } = fakeClient();
    await settleTurn(client, { ...base, balances: { allowance: 100, topup: 0, total: 100 } });

    expect(inserted[0].metadata).toMatchObject({
      models: ['openai/gpt-4o-mini'],
      calls: 2,
      tokens_in: 22_200,
      tokens_out: 430,
      tokens_cached: 10_800,
      assumed: false,
      charge_credits: charge.credits,
    });
  });

  it('charges a turn at most once: a second delivery of the same request adds nothing', async () => {
    const { client, inserted } = fakeClient();
    const input = { ...base, balances: { allowance: 100, topup: 0, total: 100 } };
    await settleTurn(client, input);
    await settleTurn(client, input);
    expect(inserted).toHaveLength(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('writes nothing for a turn that cost nothing', async () => {
    const { client, inserted, rpc } = fakeClient();
    await settleTurn(client, { ...base, charge: turnCharge([]), calls: [] });
    expect(inserted).toHaveLength(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reads the balances itself when it is not given them', async () => {
    const { client, inserted, rpc } = fakeClient({ rpc: () => ({ data: [{ allowance: 1, topup: 100 }], error: null }) });
    // A dearer turn than the base one, which is a single credit the allowance alone would cover.
    const big = turnCharge([{ model: 'openai/gpt-5.4', promptTokens: 12_000, completionTokens: 1500, cachedTokens: 0 }]);
    await settleTurn(client, { ...base, charge: big });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(inserted.map((row) => row.pool)).toEqual(['allowance', 'topup']);
  });

  it('records the charge somewhere when the balance is unreadable, rather than dropping it', async () => {
    const { client, inserted } = fakeClient({ rpc: () => ({ data: null, error: { message: 'boom' } }) });
    await settleTurn(client, base);
    expect(inserted).toEqual([expect.objectContaining({ pool: 'allowance', credits: -charge.credits })]);
  });

  it('is loud about a charge it could not write, and still does not throw', async () => {
    const { client } = fakeClient({ insertError: { code: '42501', message: 'denied' } });
    await expect(settleTurn(client, { ...base, balances: { allowance: 100, topup: 0, total: 100 } })).resolves.toBeUndefined();
    expect(String((console.error as ReturnType<typeof vi.fn>).mock.calls[0][0])).toMatch(/LOST CHARGE/);
  });

  it('does not throw when the client itself blows up', async () => {
    const client = {
      rpc: async () => {
        throw new Error('network');
      },
      from: () => {
        throw new Error('network');
      },
    } as unknown as SupabaseClient;
    await expect(settleTurn(client, base)).resolves.toBeUndefined();
  });
});

describe('adjustCredits', () => {
  const input = { workspaceId: 'ws-1', ownerUserId: 'owner-1', actorUserId: 'admin-1', credits: 500, note: 'launch gift' };

  it('adds to the top-up pool, which does not expire, never to the allowance', async () => {
    const { client, inserted } = fakeClient();
    expect(await adjustCredits(client, input)).toBe(true);
    expect(inserted[0]).toMatchObject({ pool: 'topup', kind: 'adjust', credits: 500, actor_user_id: 'admin-1' });
    expect('window_start' in inserted[0]).toBe(false);
    expect(inserted[0].metadata).toMatchObject({ source: 'admin', note: 'launch gift' });
  });

  it('takes credits away with a negative amount', async () => {
    const { client, inserted } = fakeClient();
    await adjustCredits(client, { ...input, credits: -40 });
    expect(inserted[0]).toMatchObject({ credits: -40 });
  });

  it('refuses zero and nonsense without writing anything', async () => {
    const { client, inserted } = fakeClient();
    for (const credits of [0, Number.NaN, 0.4]) {
      expect(await adjustCredits(client, { ...input, credits }), String(credits)).toBe(false);
    }
    expect(inserted).toHaveLength(0);
  });

  it('says whether it landed, and does not throw when it did not', async () => {
    const { client } = fakeClient({ insertError: { code: '42501', message: 'denied' } });
    expect(await adjustCredits(client, input)).toBe(false);
  });
});
