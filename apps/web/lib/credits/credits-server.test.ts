import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  adjustCredits,
  ensureAllowance,
  ensureTrialGrant,
  expireTrialCredits,
  getCreditSnapshot,
  hasEverPurchased,
  readBalances,
  settleTurn,
} from './credits-server';
import { turnCharge, type UsageCall } from './pricing';

// The anchor read is its own query on another table; it has its own tests. Here
// it is just "the billing day", set per test.
const anchor = vi.hoisted(() => ({ value: null as string | null }));
vi.mock('@/lib/urgans-usage-server', () => ({ readBillingAnchor: async () => anchor.value }));

type Row = Record<string, unknown>;
type Balances = { trial?: unknown; allowance?: unknown; topup?: unknown };

type FakeOptions = {
  rpc?: () => { data: unknown; error: { message: string } | null };
  insertError?: { code?: string; message: string };
  /** What profiles.paid_at holds for the owner. Undefined means the read fails. */
  paidAt?: string | null | undefined;
  /** How many kind='topup' ledger rows exist. */
  topupRows?: number;
  topupReadFails?: boolean;
};

/**
 * A recording fake of the calls this module makes. It enforces the ledger's
 * unique dedupe_key the way the real index does (a repeat insert fails with
 * 23505) and can be told to fail, so the paths a test cannot reach against a real
 * database are exercised here.
 */
function fakeClient(opts: FakeOptions = {}) {
  const inserted: Row[] = [];
  const keys = new Set<string>();
  const empty: Balances = { trial: 0, allowance: 0, topup: 0 };
  const client = {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe('credit_balances');
      expect(Object.keys(args)).toEqual(['p_workspace']);
      return opts.rpc ? opts.rpc() : { data: [empty], error: null };
    }),
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () =>
                'paidAt' in opts && opts.paidAt === undefined
                  ? { data: null, error: { message: 'boom' } }
                  : { data: { paid_at: opts.paidAt ?? null }, error: null },
            }),
          }),
        };
      }
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
        select: () => ({
          eq: () => ({
            eq: () => ({
              limit: async () =>
                opts.topupReadFails
                  ? { data: null, error: { message: 'boom' } }
                  : { data: Array.from({ length: opts.topupRows ?? 0 }, () => ({ id: 'x' })), error: null },
            }),
          }),
        }),
      };
    }),
  };
  return { client: client as unknown as SupabaseClient, inserted, rpc: client.rpc };
}

const balancesRpc = (b: Balances) => () => ({ data: [b], error: null });

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
  it('reads every source and adds them up, for the team alone', async () => {
    const { client, rpc } = fakeClient({ rpc: balancesRpc({ trial: 20, allowance: 120, topup: 30 }) });
    expect(await readBalances(client, 'ws-1')).toEqual({ trial: 20, allowance: 120, topup: 30, total: 170 });
    expect(rpc).toHaveBeenCalledWith('credit_balances', { p_workspace: 'ws-1' });
  });

  it('reads the numbers Postgres sends for a bigint, which arrive as strings', async () => {
    const { client } = fakeClient({ rpc: balancesRpc({ trial: '0', allowance: '120', topup: '-4' }) });
    expect(await readBalances(client, 'ws-1')).toEqual({ trial: 0, allowance: 120, topup: -4, total: 116 });
  });

  it('accepts a single object as well as a one-row array', async () => {
    const { client } = fakeClient({ rpc: () => ({ data: { trial: 1, allowance: 5, topup: 1 }, error: null }) });
    expect((await readBalances(client, 'ws-1'))?.total).toBe(7);
  });

  it('is zero for a team with no rows, which is not the same as unreadable', async () => {
    const { client } = fakeClient({ rpc: () => ({ data: [], error: null }) });
    expect(await readBalances(client, 'ws-1')).toEqual({ trial: 0, allowance: 0, topup: 0, total: 0 });
  });

  it('is null when it cannot be read, so callers can tell the difference and not enforce', async () => {
    const failing = fakeClient({ rpc: () => ({ data: null, error: { message: 'boom' } }) });
    expect(await readBalances(failing.client, 'ws-1')).toBeNull();

    const throwing = fakeClient({
      rpc: () => {
        throw new Error('network');
      },
    });
    expect(await readBalances(throwing.client, 'ws-1')).toBeNull();
  });
});

describe('ensureAllowance', () => {
  const input = { workspaceId: 'ws-1', ownerUserId: 'owner-1', windowStart: '2026-10-01', credits: 660 };

  it("writes the window's allowance to the allowance source with a key that makes it happen once", async () => {
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

describe('ensureTrialGrant', () => {
  const input = { workspaceId: 'ws-1', ownerUserId: 'owner-1' };

  it('gives 50 credits tagged to the trial, with a key naming the team so it can only happen once', async () => {
    const { client, inserted } = fakeClient();
    expect(await ensureTrialGrant(client, input)).toBe(true);
    expect(inserted).toEqual([
      expect.objectContaining({ pool: 'trial', kind: 'trial', credits: 50, dedupe_key: 'trial:ws-1' }),
    ]);
    expect('window_start' in inserted[0]).toBe(false);
  });

  it('is granted once however often it is asked', async () => {
    const { client, inserted } = fakeClient();
    await ensureTrialGrant(client, input);
    expect(await ensureTrialGrant(client, input)).toBe(true);
    expect(inserted).toHaveLength(1);
  });
});

describe('hasEverPurchased', () => {
  const input = { workspaceId: 'ws-1', ownerUserId: 'owner-1' };

  it('is no for a team that bought neither a plan nor a top-up', async () => {
    expect(await hasEverPurchased(fakeClient().client, input)).toBe(false);
  });

  it('is yes once the owner has paid for a plan', async () => {
    expect(await hasEverPurchased(fakeClient({ paidAt: '2026-09-02T00:00:00Z' }).client, input)).toBe(true);
  });

  it('is yes once the team has bought a top-up', async () => {
    expect(await hasEverPurchased(fakeClient({ topupRows: 1 }).client, input)).toBe(true);
  });

  it('answers yes whenever it cannot find out, because the answer decides whether credits are taken away', async () => {
    expect(await hasEverPurchased(fakeClient({ paidAt: undefined }).client, input)).toBe(true);
    expect(await hasEverPurchased(fakeClient({ topupReadFails: true }).client, input)).toBe(true);
    expect(await hasEverPurchased(fakeClient().client, { workspaceId: 'ws-1', ownerUserId: null })).toBe(true);
  });
});

describe('expireTrialCredits', () => {
  const input = { workspaceId: 'ws-1', ownerUserId: 'owner-1', credits: 37 };

  it('removes exactly what is left, tagged to the trial and nothing else, once', async () => {
    const { client, inserted } = fakeClient();
    expect(await expireTrialCredits(client, input)).toBe(true);
    expect(await expireTrialCredits(client, input)).toBe(true);
    expect(inserted).toEqual([
      expect.objectContaining({ pool: 'trial', kind: 'expire', credits: -37, dedupe_key: 'expire:trial:ws-1' }),
    ]);
  });

  it('writes nothing when nothing is left', async () => {
    const { client, inserted } = fakeClient();
    for (const credits of [0, -5, Number.NaN]) {
      expect(await expireTrialCredits(client, { ...input, credits }), String(credits)).toBe(false);
    }
    expect(inserted).toHaveLength(0);
  });
});

describe('getCreditSnapshot', () => {
  const base = { workspaceId: 'ws-1', ownerUserId: 'owner-1', now: new Date('2026-10-15T09:00:00Z') };

  describe('a subscriber', () => {
    it("is granted the plan's allowance for the window, and its balance is everything it holds", async () => {
      const { client, inserted } = fakeClient({ rpc: balancesRpc({ trial: 0, allowance: 300, topup: 40 }) });
      const snap = await getCreditSnapshot(client, { ...base, team: { state: 'paid', tier: 'manager' } });

      expect(inserted[0]).toMatchObject({ credits: 300, window_start: '2026-10-01' });
      expect(snap).toEqual({
        trial: 0,
        allowance: 300,
        topup: 40,
        total: 340,
        account: 'subscriber',
        monthlyAllowance: 300,
        referenceCredits: 300,
        nextGrantAt: '2026-11-01T00:00:00.000Z',
      });
    });

    it('rolls over: last month\'s unused credits are still in the balance when this month\'s arrive', async () => {
      // 400 left from the earlier windows, plus this window's grant, all one balance.
      const { client, inserted } = fakeClient({ rpc: balancesRpc({ allowance: 400 + 150 }) });
      const snap = await getCreditSnapshot(client, { ...base, team: { state: 'paid', tier: 'solo' } });
      expect(inserted).toHaveLength(1);
      expect(snap?.total).toBe(550);
    });

    it('puts the window on the billing day, not the first of the month', async () => {
      anchor.value = '2026-03-12T00:00:00.000Z';
      const { client, inserted } = fakeClient();
      const snap = await getCreditSnapshot(client, { ...base, team: { state: 'paid', tier: 'solo' } });

      expect(snap?.nextGrantAt).toBe('2026-11-12T00:00:00.000Z');
      expect(inserted[0]).toMatchObject({ credits: 100, window_start: '2026-10-12' });
    });

    it('is never given a trial grant', async () => {
      const { client, inserted } = fakeClient();
      await getCreditSnapshot(client, { ...base, team: { state: 'paid', tier: 'solo' } });
      expect(inserted.map((row) => row.pool)).toEqual(['allowance']);
    });
  });

  describe('a trial', () => {
    it('is given its 50 credits once and no monthly allowance, even though its tier reads as the biggest', async () => {
      const { client, inserted } = fakeClient({ rpc: balancesRpc({ trial: 50 }) });
      const snap = await getCreditSnapshot(client, { ...base, team: { state: 'trial', tier: 'label' } });

      expect(inserted).toEqual([expect.objectContaining({ pool: 'trial', kind: 'trial', credits: 50 })]);
      expect(snap).toMatchObject({ account: 'trial', trial: 50, total: 50, monthlyAllowance: 0, referenceCredits: 50, nextGrantAt: null });
    });

    it('is granted once however often it looks', async () => {
      const { client, inserted } = fakeClient();
      await getCreditSnapshot(client, { ...base, team: { state: 'trial' } });
      await getCreditSnapshot(client, { ...base, team: { state: 'trial' } });
      expect(inserted).toHaveLength(1);
    });
  });

  describe('an account whose trial ended', () => {
    const walled = { state: 'walled', tier: 'label' };

    it('loses the leftover trial credits when nothing was bought, and keeps every other credit', async () => {
      const { client, inserted } = fakeClient({ rpc: balancesRpc({ trial: 31, allowance: 0, topup: 12 }) });
      const snap = await getCreditSnapshot(client, { ...base, team: walled });

      expect(inserted).toEqual([expect.objectContaining({ pool: 'trial', kind: 'expire', credits: -31 })]);
      expect(snap).toMatchObject({ account: 'credits_only', trial: 0, topup: 12, total: 12, nextGrantAt: null });
    });

    it('keeps them if the owner bought a plan', async () => {
      const { client, inserted } = fakeClient({ rpc: balancesRpc({ trial: 31 }), paidAt: '2026-09-30T00:00:00Z' });
      const snap = await getCreditSnapshot(client, { ...base, team: walled });
      expect(inserted).toHaveLength(0);
      expect(snap?.trial).toBe(31);
    });

    it('keeps them if the team bought a top-up', async () => {
      const { client, inserted } = fakeClient({ rpc: balancesRpc({ trial: 31 }), topupRows: 1 });
      const snap = await getCreditSnapshot(client, { ...base, team: walled });
      expect(inserted).toHaveLength(0);
      expect(snap?.trial).toBe(31);
    });

    it('keeps them when it cannot tell whether anything was bought', async () => {
      const { client, inserted } = fakeClient({ rpc: balancesRpc({ trial: 31 }), paidAt: undefined });
      expect((await getCreditSnapshot(client, { ...base, team: walled }))?.trial).toBe(31);
      expect(inserted).toHaveLength(0);
    });

    it('does not report them gone when the removal could not be written', async () => {
      const { client } = fakeClient({ rpc: balancesRpc({ trial: 31 }), insertError: { code: '42501', message: 'denied' } });
      expect((await getCreditSnapshot(client, { ...base, team: walled }))?.trial).toBe(31);
    });

    it('has nothing to take when the trial was already spent', async () => {
      const { client, inserted } = fakeClient({ rpc: balancesRpc({ trial: 0, topup: 5 }) });
      await getCreditSnapshot(client, { ...base, team: walled });
      expect(inserted).toHaveLength(0);
    });

    it('is granted nothing new', async () => {
      const { client, inserted } = fakeClient();
      await getCreditSnapshot(client, { ...base, team: walled });
      expect(inserted).toHaveLength(0);
    });
  });

  describe('a subscription that lapsed', () => {
    it('keeps its whole balance, allowance and bought credits alike, and takes nothing back', async () => {
      const { client, inserted } = fakeClient({ rpc: balancesRpc({ trial: 20, allowance: 300, topup: 80 }) });
      const snap = await getCreditSnapshot(client, { ...base, team: { state: 'read_only', tier: 'manager' } });

      expect(inserted).toHaveLength(0);
      expect(snap).toMatchObject({ account: 'credits_only', total: 400, allowance: 300, topup: 80, trial: 20, monthlyAllowance: 0 });
    });
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
    charge,
    calls: CALLS,
  };
  const big = turnCharge([{ model: 'openai/gpt-5.4', promptTokens: 12_000, completionTokens: 1500, cachedTokens: 0 }]);

  it('charges a turn the allowance covers to the allowance source only, as a negative amount with no window', async () => {
    const { client, inserted } = fakeClient();
    await settleTurn(client, { ...base, balances: { trial: 0, allowance: 100, topup: 50 } });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      pool: 'allowance',
      kind: 'spend',
      credits: -charge.credits,
      dedupe_key: 'spend:req-1:allowance',
      workspace_id: 'ws-1',
      actor_user_id: 'user-1',
    });
    expect('window_start' in inserted[0]).toBe(false);
  });

  it('draws the trial credits first', async () => {
    const { client, inserted } = fakeClient();
    await settleTurn(client, { ...base, balances: { trial: 40, allowance: 100, topup: 50 } });
    expect(inserted).toEqual([expect.objectContaining({ pool: 'trial', credits: -charge.credits, dedupe_key: 'spend:req-1:trial' })]);
  });

  it('splits across the sources in order, and the parts add up to the charge', async () => {
    const { client, inserted } = fakeClient();
    expect(big.credits).toBeGreaterThan(8);

    await settleTurn(client, { ...base, charge: big, balances: { trial: 3, allowance: 5, topup: 100 } });

    expect(inserted.map((row) => row.pool)).toEqual(['trial', 'allowance', 'topup']);
    expect(inserted[0]).toMatchObject({ credits: -3, dedupe_key: 'spend:req-1:trial' });
    expect(inserted[1]).toMatchObject({ credits: -5, dedupe_key: 'spend:req-1:allowance' });
    expect(inserted[2]).toMatchObject({ credits: -(big.credits - 8), dedupe_key: 'spend:req-1:topup' });
    expect(inserted.reduce((sum, row) => sum + (row.credits as number), 0)).toBe(-big.credits);
  });

  it('shares the provider cost between the rows in proportion, so the ledger sums to what the bill was', async () => {
    const { client, inserted } = fakeClient();
    await settleTurn(client, { ...base, charge: big, balances: { trial: 3, allowance: 5, topup: 100 } });

    const total = inserted.reduce((sum, row) => sum + (row.provider_cost_rodi as number), 0);
    expect(total).toBeCloseTo(big.rodi, 2);
  });

  it('puts an overshoot on the top-up source, where it can be seen and repaid', async () => {
    const { client, inserted } = fakeClient();
    await settleTurn(client, { ...base, balances: { trial: 0, allowance: 0, topup: 0 } });
    expect(inserted).toEqual([expect.objectContaining({ pool: 'topup', credits: -charge.credits })]);
  });

  it('records what the turn used on the row, for checking a charge against the bill', async () => {
    const { client, inserted } = fakeClient();
    await settleTurn(client, { ...base, balances: { trial: 0, allowance: 100, topup: 0 } });

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
    const input = { ...base, balances: { trial: 0, allowance: 100, topup: 0 } };
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
    const { client, inserted, rpc } = fakeClient({ rpc: balancesRpc({ trial: 0, allowance: 1, topup: 100 }) });
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
    await expect(settleTurn(client, { ...base, balances: { trial: 0, allowance: 100, topup: 0 } })).resolves.toBeUndefined();
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

  it('adds to the top-up source, the one no rule takes back, never to the trial or the allowance', async () => {
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
