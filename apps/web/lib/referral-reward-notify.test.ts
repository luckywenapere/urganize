import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const sendPush = vi.fn();
const sendMail = vi.fn();
let emailConfigured = true;

vi.mock('./push-server', () => ({ sendPushToUsers: (...args: unknown[]) => sendPush(...args) }));
vi.mock('./email', () => ({
  isEmailConfigured: () => emailConfigured,
  sendEmail: (...args: unknown[]) => sendMail(...args),
}));

import { REFERRAL_REWARD_CAP } from './referral-credits';
import { rewardReferrerOnFirstPayment } from './referrals-server';

// rewardReferrerOnFirstPayment against an in-memory stand-in that keeps its
// writes, so a payment and then a redelivery of the same payment can be played
// through and the notifications counted.

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

function fakeAdmin(db: Db): SupabaseClient {
  const from = (table: string) => {
    let mode: 'select' | 'update' | 'insert' = 'select';
    let patch: Row = {};
    let inserted: Row | null = null;
    let head = false;
    const filters: Array<(row: Row) => boolean> = [];
    const matching = () => (db[table] ?? []).filter((row) => filters.every((test) => test(row)));
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
      const rows = matching();
      return head ? { data: null, count: rows.length, error: null } : { data: rows, error: null };
    };
    const builder: Record<string, unknown> = {
      select: (_cols?: string, opts?: { head?: boolean }) => {
        head = Boolean(opts?.head);
        return builder;
      },
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
      not: (column: string, _op: string, value: unknown) => {
        filters.push((row) => (row[column] ?? null) !== value);
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
  const auth = {
    admin: {
      getUserById: (id: string) =>
        Promise.resolve({
          data: { user: { id, email: `${id}@example.com`, user_metadata: { name: 'Ada Okafor' } } },
          error: null,
        }),
    },
  };
  return { from, auth } as unknown as SupabaseClient;
}

function world(over: { rewardedAt?: string | null; alreadyRewarded?: number } = {}): Db {
  const rewarded = Array.from({ length: over.alreadyRewarded ?? 0 }, (_, i) => ({
    referred_workspace_id: `old${i}`,
    referrer_workspace_id: 'inviter',
    rewarded_at: '2026-09-01T00:00:00Z',
    reward_credits: 100,
    reversed_at: null,
  }));
  return {
    workspaces: [
      { id: 'invited', owner_id: 'payer' },
      { id: 'inviter', owner_id: 'inviter_owner' },
    ],
    user_referrals: [
      {
        referred_workspace_id: 'invited',
        referrer_workspace_id: 'inviter',
        rewarded_at: over.rewardedAt ?? null,
        reward_credits: null,
        reversed_at: null,
      },
      ...rewarded,
    ],
    credit_ledger: [],
  };
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_FEATURE_REFERRALS', 'true');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_REFERRAL_CREDITS', 'true');
  sendPush.mockReset().mockResolvedValue(undefined);
  sendMail.mockReset().mockResolvedValue({ ok: true });
  emailConfigured = true;
});

const pay = (db: Db) => rewardReferrerOnFirstPayment(fakeAdmin(db), { payerUserId: 'payer', reference: 'ref_1' });

describe('telling the inviter they earned credits', () => {
  it('sends a push and an email, naming nobody, when the reward is paid', async () => {
    const db = world();
    await pay(db);

    expect(sendPush).toHaveBeenCalledTimes(1);
    const [, users, payload] = sendPush.mock.calls[0];
    expect(users).toEqual(['inviter_owner']);
    expect(payload).toMatchObject({ title: 'You earned 100 credits', url: '/dashboard/credits' });
    expect(JSON.stringify(payload)).not.toContain('payer');

    expect(sendMail).toHaveBeenCalledTimes(1);
    const [, mail] = sendMail.mock.calls[0];
    expect(mail).toMatchObject({
      templateId: 'referral_reward',
      to: 'inviter_owner@example.com',
      recipientUserId: 'inviter_owner',
      props: { recipientName: 'Ada Okafor', credits: 100 },
    });
    expect(mail.props.creditsUrl).toMatch(/\/dashboard\/credits$/);
  });

  it('tells them once, however many times the payment is delivered', async () => {
    const db = world();
    await pay(db);
    await pay(db);
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('does not tell them again when the credits were paid earlier but the row was never stamped', async () => {
    // The first delivery paid the reward and then failed to mark the referral
    // row. The ledger key refuses a second payment, so nothing new was paid and
    // nothing new should be announced.
    const db = world();
    db.credit_ledger.push({ workspace_id: 'inviter', pool: 'topup', credits: 100, dedupe_key: 'referral:invited' });
    await pay(db);
    expect(sendPush).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(db.credit_ledger).toHaveLength(1);
  });

  it('says nothing when no reward was paid', async () => {
    await pay(world({ rewardedAt: '2026-10-01T00:00:00Z' }));
    await pay(world({ alreadyRewarded: REFERRAL_REWARD_CAP }));
    await rewardReferrerOnFirstPayment(fakeAdmin({ ...world(), user_referrals: [] }), {
      payerUserId: 'payer',
      reference: 'r',
    });
    expect(sendPush).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('still sends the email when the push fails, and never throws', async () => {
    sendPush.mockRejectedValue(new Error('push provider down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(pay(world())).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('still sends the push when the email fails', async () => {
    sendMail.mockRejectedValue(new Error('mail provider down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(pay(world())).resolves.toBeUndefined();
    expect(sendPush).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('skips the email, not the push, when email is not configured', async () => {
    emailConfigured = false;
    await pay(world());
    expect(sendMail).not.toHaveBeenCalled();
    expect(sendPush).toHaveBeenCalledTimes(1);
  });

  it('sends nothing while the referral switches are off', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_REFERRAL_CREDITS', 'false');
    await pay(world());
    expect(sendPush).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
});
