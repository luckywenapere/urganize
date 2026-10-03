import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handleRefundForReferrals } from './referrals-server';

// handleRefundForReferrals run against a small in-memory stand-in for Supabase
// that keeps its writes, so a refund and then a redelivery of the same refund can
// be played through. It supports exactly what the handler uses: eq / is / order /
// limit / maybeSingle, update, insert with a unique dedupe key, and the
// credit_balances function.

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

function fakeAdmin(db: Db, options: { balanceError?: boolean } = {}): SupabaseClient {
  const from = (table: string) => {
    let mode: 'select' | 'update' | 'insert' = 'select';
    let patch: Row = {};
    let inserted: Row | null = null;
    const filters: Array<(row: Row) => boolean> = [];
    let orderBy: { column: string; ascending: boolean } | null = null;
    let max = Infinity;

    const matching = () => {
      let rows = (db[table] ?? []).filter((row) => filters.every((test) => test(row)));
      if (orderBy) {
        const { column, ascending } = orderBy;
        rows = [...rows].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1));
      }
      return rows.slice(0, max);
    };
    const run = () => {
      if (mode === 'insert' && inserted) {
        const key = inserted.dedupe_key;
        if (key && (db[table] ?? []).some((row) => row.dedupe_key === key)) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        (db[table] = db[table] ?? []).push(inserted);
        return { data: null, error: null };
      }
      if (mode === 'update') {
        for (const row of matching()) Object.assign(row, patch);
        return { data: null, error: null };
      }
      return { data: matching(), error: null };
    };

    const builder: Record<string, unknown> = {
      select: () => builder,
      update: (value: Row) => {
        mode = 'update';
        patch = value;
        return builder;
      },
      insert: (value: Row) => {
        mode = 'insert';
        inserted = { ...value };
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      is: (column: string, value: unknown) => {
        filters.push((row) => (row[column] ?? null) === value);
        return builder;
      },
      order: (column: string, opts?: { ascending?: boolean }) => {
        orderBy = { column, ascending: opts?.ascending !== false };
        return builder;
      },
      limit: (count: number) => {
        max = count;
        return builder;
      },
      maybeSingle: () => {
        const result = run();
        return Promise.resolve({ data: Array.isArray(result.data) ? (result.data[0] ?? null) : null, error: result.error });
      },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return builder;
  };

  const rpc = (name: string, args: { p_workspace: string }) => {
    if (name !== 'credit_balances') return Promise.resolve({ data: null, error: { message: 'unknown function' } });
    if (options.balanceError) return Promise.resolve({ data: null, error: { message: 'down' } });
    const topup = (db.credit_ledger ?? [])
      .filter((row) => row.workspace_id === args.p_workspace && row.pool === 'topup')
      .reduce((sum, row) => sum + Number(row.credits), 0);
    return Promise.resolve({ data: [{ trial: 0, allowance: 0, topup }], error: null });
  };

  return { from, rpc } as unknown as SupabaseClient;
}

const FIRST = 'ref_first';
const RENEWAL = 'ref_renewal';

function world(over: { balance?: number; reversedAt?: string | null; rewardedAt?: string | null } = {}): Db {
  return {
    subscription_charges: [
      { reference: FIRST, workspace_id: 'invited', amount_kobo: 500_000, charged_at: '2026-10-01T10:00:00Z', excluded_at: null },
      { reference: RENEWAL, workspace_id: 'invited', amount_kobo: 500_000, charged_at: '2027-10-01T10:00:00Z', excluded_at: null },
    ],
    user_referrals: [
      {
        referred_workspace_id: 'invited',
        referrer_workspace_id: 'inviter',
        rewarded_at: over.rewardedAt === undefined ? '2026-10-01T10:00:05Z' : over.rewardedAt,
        reward_credits: 100,
        reversed_at: over.reversedAt ?? null,
        reversed_credits: null,
      },
    ],
    workspaces: [{ id: 'inviter', owner_id: 'inviter_owner' }],
    credit_ledger: [
      { workspace_id: 'inviter', pool: 'topup', credits: over.balance ?? 100, dedupe_key: 'referral:invited' },
    ],
  };
}

const balance = (db: Db) =>
  (db.credit_ledger ?? []).filter((row) => row.workspace_id === 'inviter').reduce((s, r) => s + Number(r.credits), 0);

describe('a refund and the referral reward', () => {
  it('takes the reward back and stops the payment earning commission on a full refund of the first payment', async () => {
    const db = world();
    await handleRefundForReferrals(fakeAdmin(db), { reference: FIRST, refundAmountKobo: 500_000 });

    expect(balance(db)).toBe(0);
    const clawback = db.credit_ledger.find((row) => row.dedupe_key === 'referral-clawback:invited');
    expect(clawback).toMatchObject({ kind: 'adjust', pool: 'topup', credits: -100, owner_user_id: 'inviter_owner' });
    expect(db.user_referrals[0]).toMatchObject({ reversed_credits: 100 });
    expect(db.user_referrals[0].reversed_at).toBeTruthy();
    expect(db.subscription_charges[0].excluded_at).toBeTruthy();
    expect(db.subscription_charges[0].excluded_reason).toBe('Refunded in Paystack');
    // rewarded_at stays, so the same team can never be rewarded twice
    expect(db.user_referrals[0].rewarded_at).toBeTruthy();
  });

  it('does it once, however many times the refund is delivered', async () => {
    const db = world({ balance: 300 });
    const admin = fakeAdmin(db);
    await handleRefundForReferrals(admin, { reference: FIRST, refundAmountKobo: 500_000 });
    await handleRefundForReferrals(admin, { reference: FIRST, refundAmountKobo: 500_000 });
    expect(balance(db)).toBe(200);
    expect(db.credit_ledger.filter((row) => row.dedupe_key === 'referral-clawback:invited')).toHaveLength(1);
  });

  it('takes back only what is left, never below zero, and still records the reversal', async () => {
    const db = world({ balance: 30 });
    await handleRefundForReferrals(fakeAdmin(db), { reference: FIRST, refundAmountKobo: 500_000 });
    expect(balance(db)).toBe(0);
    expect(db.user_referrals[0]).toMatchObject({ reversed_credits: 30 });
  });

  it('records the reversal with nothing taken when the inviter has nothing left', async () => {
    const db = world({ balance: 0 });
    await handleRefundForReferrals(fakeAdmin(db), { reference: FIRST, refundAmountKobo: 500_000 });
    expect(db.credit_ledger.some((row) => row.dedupe_key === 'referral-clawback:invited')).toBe(false);
    expect(db.user_referrals[0]).toMatchObject({ reversed_credits: 0 });
    expect(db.user_referrals[0].reversed_at).toBeTruthy();
  });

  it('leaves the reward alone when a later payment is refunded, but still stops that payment earning commission', async () => {
    const db = world();
    await handleRefundForReferrals(fakeAdmin(db), { reference: RENEWAL, refundAmountKobo: 500_000 });
    expect(balance(db)).toBe(100);
    expect(db.user_referrals[0].reversed_at).toBeNull();
    expect(db.subscription_charges[1].excluded_at).toBeTruthy();
    expect(db.subscription_charges[0].excluded_at).toBeNull();
  });

  it('leaves everything alone on a partial refund', async () => {
    const db = world();
    await handleRefundForReferrals(fakeAdmin(db), { reference: FIRST, refundAmountKobo: 100_000 });
    expect(balance(db)).toBe(100);
    expect(db.user_referrals[0].reversed_at).toBeNull();
    expect(db.subscription_charges[0].excluded_at).toBeNull();
  });

  it('does nothing for a team that was never rewarded', async () => {
    const db = world({ rewardedAt: null });
    await handleRefundForReferrals(fakeAdmin(db), { reference: FIRST, refundAmountKobo: 500_000 });
    expect(balance(db)).toBe(100);
    expect(db.user_referrals[0].reversed_at).toBeNull();
  });

  it('does nothing for a payment it never recorded', async () => {
    const db = world();
    await handleRefundForReferrals(fakeAdmin(db), { reference: 'urgpitch-abc', refundAmountKobo: 500_000 });
    expect(balance(db)).toBe(100);
    expect(db.subscription_charges.every((row) => row.excluded_at === null)).toBe(true);
  });

  it('takes nothing, and does not mark the row, when the balance cannot be read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const db = world();
    await handleRefundForReferrals(fakeAdmin(db, { balanceError: true }), { reference: FIRST, refundAmountKobo: 500_000 });
    expect(balance(db)).toBe(100);
    expect(db.user_referrals[0].reversed_at).toBeNull();
    error.mockRestore();
  });

  it('never throws, whatever the database does', async () => {
    const broken = {
      from() {
        throw new Error('database down');
      },
    } as unknown as SupabaseClient;
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(handleRefundForReferrals(broken, { reference: FIRST, refundAmountKobo: 500_000 })).resolves.toBeUndefined();
    error.mockRestore();
  });
});
