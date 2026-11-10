import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { FREE_PLAN_GRANT_CREDITS, expireFreePlanAllowance, getCreditSnapshot } from './credits-server';
import { ALLOWANCE_CREDITS } from './allowance';

vi.mock('@/lib/urgans-usage-server', () => ({ readBillingAnchor: async () => null }));

type Row = Record<string, unknown>;

// The Free plan (2026-11-08) was removed on 2026-11-09, and its changelog says
// the 30 credits it granted are gone too. These tests hold that the leftover is
// taken back, once, and only from a team that never bought anything.
function fakeLedger(opts: {
  freeGrants: number;
  allowance: number;
  paidAt?: string | null;
  topupRows?: number;
}) {
  const inserted: Row[] = [];
  const keys = new Set<string>();
  const client = {
    rpc: vi.fn(async () => ({ data: [{ trial: 0, allowance: opts.allowance, topup: 0 }], error: null })),
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { paid_at: opts.paidAt ?? null }, error: null }) }) }),
        };
      }
      expect(table).toBe('credit_ledger');
      const filters: Record<string, unknown> = {};
      const query = {
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return query;
        },
        limit: async () => ({ data: Array.from({ length: opts.topupRows ?? 0 }, () => ({ id: 'x' })), error: null }),
        then: (resolve: (value: unknown) => unknown) => {
          const matchesFree = filters.kind === 'allowance' && filters.credits === FREE_PLAN_GRANT_CREDITS;
          const rows = matchesFree ? Array.from({ length: opts.freeGrants }, () => ({ credits: FREE_PLAN_GRANT_CREDITS })) : [];
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return {
        select: () => query,
        insert: async (row: Row) => {
          const key = row.dedupe_key as string;
          if (keys.has(key)) return { error: { code: '23505', message: 'duplicate' } };
          keys.add(key);
          inserted.push(row);
          return { error: null };
        },
      };
    }),
  };
  return { client: client as unknown as SupabaseClient, inserted };
}

const input = { workspaceId: 'ws-1', ownerUserId: 'owner-1' };

describe('removing the Free plan credits', () => {
  it('a Free grant is a size no paid plan grants', () => {
    expect(Object.values(ALLOWANCE_CREDITS)).not.toContain(FREE_PLAN_GRANT_CREDITS);
  });

  it('takes back what is left of the Free grants from a team that never paid', async () => {
    const { client, inserted } = fakeLedger({ freeGrants: 1, allowance: 22 });
    expect(await expireFreePlanAllowance(client, { ...input, allowance: 22 })).toBe(22);
    expect(inserted).toEqual([
      expect.objectContaining({
        workspace_id: 'ws-1',
        pool: 'allowance',
        kind: 'expire',
        credits: -22,
        dedupe_key: 'expire:free_plan:ws-1',
      }),
    ]);
  });

  it('never takes more than the Free grants added', async () => {
    const { client, inserted } = fakeLedger({ freeGrants: 1, allowance: 180 });
    expect(await expireFreePlanAllowance(client, { ...input, allowance: 180 })).toBe(30);
    expect(inserted[0]?.credits).toBe(-30);
  });

  it('leaves a team alone that bought a plan or credits', async () => {
    const paid = fakeLedger({ freeGrants: 1, allowance: 30, paidAt: '2026-11-08T12:00:00Z' });
    expect(await expireFreePlanAllowance(paid.client, { ...input, allowance: 30 })).toBe(0);
    expect(paid.inserted).toEqual([]);
    const topup = fakeLedger({ freeGrants: 1, allowance: 30, topupRows: 1 });
    expect(await expireFreePlanAllowance(topup.client, { ...input, allowance: 30 })).toBe(0);
    expect(topup.inserted).toEqual([]);
  });

  it('leaves a team alone that never had a Free grant', async () => {
    const { client, inserted } = fakeLedger({ freeGrants: 0, allowance: 150 });
    expect(await expireFreePlanAllowance(client, { ...input, allowance: 150 })).toBe(0);
    expect(inserted).toEqual([]);
  });

  it("takes them back the first time a walled team's credits are read", async () => {
    const { client, inserted } = fakeLedger({ freeGrants: 1, allowance: 30 });
    const snapshot = await getCreditSnapshot(client, { ...input, team: { state: 'walled', tier: null } });
    expect(snapshot?.allowance).toBe(0);
    expect(snapshot?.total).toBe(0);
    expect(inserted).toHaveLength(1);
  });
});
