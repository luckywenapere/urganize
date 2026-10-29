import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase, type FakeDb, type FakeOptions } from './test-support/fake-supabase';

const push = vi.fn(async (..._args: unknown[]) => {});
const email = vi.fn(async (..._args: unknown[]) => ({ ok: true }));
let emailConfigured = true;

vi.mock('./push-server', () => ({ sendPushToUsers: (...args: unknown[]) => push(...args) }));
vi.mock('./email', () => ({
  isEmailConfigured: () => emailConfigured,
  sendEmail: (...args: unknown[]) => email(...args),
}));

import {
  paybackReleaseDayRange,
  paybackUrl,
  runPaybackQuestionSweep,
  runSpendCreditsSweep,
} from './release-spend-sweeps-server';

// Both daily steps, against the real rules with an in-memory database. Only the
// push and the email sender are stubbed, so what is written and what is sent is
// checked and not assumed.

// 07:00 UTC on 2026-10-09 is 08:00 in Lagos on the 9th. The credits sweep covers
// the Lagos days the 6th, 7th and 8th (never today).
const NOW = new Date('2026-10-09T07:00:00Z');

const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';

function usage(releaseId: string | null, createdAt: string, credits: number, over: Record<string, unknown> = {}) {
  return { release_id: releaseId, workspace_id: 'ws-x', created_at: createdAt, credits_charged: credits, ...over };
}

function creditsDb(over: FakeDb = {}): FakeDb {
  return {
    ai_usage_events: [],
    releases: [
      { id: R1, owner_user_id: 'owner-1', metadata: {} },
      { id: R2, owner_user_id: 'owner-2', metadata: {} },
    ],
    workspaces: [
      { id: 'ws-1', owner_id: 'owner-1' },
      { id: 'ws-2', owner_id: 'owner-2' },
    ],
    release_spend: [],
    ...over,
  };
}

let db: FakeDb;
let options: FakeOptions;
const client = () => makeFakeSupabase(db, options);

beforeEach(() => {
  push.mockClear();
  email.mockClear();
  emailConfigured = true;
  options = {};
});

describe('runSpendCreditsSweep', () => {
  it('writes one automatic line per rollout per day, at ₦15 a credit', async () => {
    db = creditsDb({
      ai_usage_events: [
        usage(R1, '2026-10-07T10:00:00Z', 4),
        usage(R1, '2026-10-07T15:00:00Z', 6),
        usage(R1, '2026-10-08T09:00:00Z', 2),
        usage(R2, '2026-10-07T11:00:00Z', 10),
      ],
    });
    const summary = await runSpendCreditsSweep(client().client, NOW);
    expect(summary).toMatchObject({ releases: 2, written: 3, skipped: null });

    const lines = db.release_spend;
    expect(lines).toHaveLength(3);
    const day7 = lines.find((line) => line.release_id === R1 && line.spent_on === '2026-10-07');
    expect(day7).toMatchObject({
      amount_kobo: 15_000, // 10 credits at ₦15
      category: 'other',
      source: 'urganize',
      paid_to: 'Urganize',
      note: '10 UrgAns credits',
      dedupe_key: `credits:${R1}:2026-10-07`,
      workspace_id: 'ws-1',
      created_by: null,
    });
    expect(lines.find((line) => line.release_id === R2)).toMatchObject({ workspace_id: 'ws-2', amount_kobo: 15_000 });
  });

  it('corrects a day instead of adding a second line when it runs again', async () => {
    db = creditsDb({ ai_usage_events: [usage(R1, '2026-10-07T10:00:00Z', 4)] });
    await runSpendCreditsSweep(client().client, NOW);
    expect(db.release_spend).toHaveLength(1);
    expect(db.release_spend[0].amount_kobo).toBe(6_000);

    db.ai_usage_events.push(usage(R1, '2026-10-07T20:00:00Z', 6));
    await runSpendCreditsSweep(client().client, NOW);
    expect(db.release_spend).toHaveLength(1);
    expect(db.release_spend[0].amount_kobo).toBe(15_000);
  });

  it('puts a late-night call on the Lagos day it happened in, and leaves today alone', async () => {
    db = creditsDb({
      ai_usage_events: [
        usage(R1, '2026-10-05T22:59:00Z', 1), // Lagos 05 Oct 23:59: before the window
        usage(R1, '2026-10-05T23:30:00Z', 2), // Lagos 06 Oct 00:30
        usage(R1, '2026-10-06T23:30:00Z', 3), // Lagos 07 Oct 00:30
        usage(R1, '2026-10-08T22:59:00Z', 4), // Lagos 08 Oct 23:59
        usage(R1, '2026-10-08T23:30:00Z', 5), // Lagos 09 Oct 00:30: today, still filling up
      ],
    });
    await runSpendCreditsSweep(client().client, NOW);
    const byDay = Object.fromEntries(db.release_spend.map((line) => [line.spent_on, line.amount_kobo]));
    expect(byDay).toEqual({ '2026-10-06': 3_000, '2026-10-07': 4_500, '2026-10-08': 6_000 });
  });

  it('ignores calls with no rollout, a throwaway rollout and a rollout that is gone', async () => {
    db = creditsDb({
      ai_usage_events: [
        usage(null, '2026-10-07T10:00:00Z', 5),
        usage(R2, '2026-10-07T10:00:00Z', 5),
        usage('99999999-9999-4999-8999-999999999999', '2026-10-07T10:00:00Z', 5),
        usage(R1, '2026-10-07T10:00:00Z', 0),
      ],
      releases: [
        { id: R1, owner_user_id: 'owner-1', metadata: {} },
        { id: R2, owner_user_id: 'owner-2', metadata: { test_release: true } },
      ],
    });
    const summary = await runSpendCreditsSweep(client().client, NOW);
    expect(db.release_spend).toEqual([]);
    expect(summary.skipped).toBe('nothing_to_do');
  });

  it('writes nothing when the usage log cannot be read', async () => {
    db = creditsDb({ ai_usage_events: [usage(R1, '2026-10-07T10:00:00Z', 4)] });
    options = { failSelectOn: ['ai_usage_events'] };
    const summary = await runSpendCreditsSweep(client().client, NOW);
    expect(summary.skipped).toBe('usage_unreadable');
    expect(db.release_spend).toEqual([]);
  });

  it('writes nothing from a read that stopped at its cap, because a total that is too low would overwrite a right one', async () => {
    db = creditsDb({
      ai_usage_events: Array.from({ length: 1000 }, () => usage(R1, '2026-10-07T10:00:00Z', 1)),
      release_spend: [
        {
          id: 'old',
          release_id: R1,
          category: 'other',
          amount_kobo: 999_999,
          spent_on: '2026-10-07',
          source: 'urganize',
          dedupe_key: `credits:${R1}:2026-10-07`,
        },
      ],
    });
    const summary = await runSpendCreditsSweep(client().client, NOW, { rowCap: 1000 });
    expect(summary.skipped).toBe('usage_truncated');
    expect(db.release_spend[0].amount_kobo).toBe(999_999);
  });

  it('reports a refused write and does not throw', async () => {
    db = creditsDb({ ai_usage_events: [usage(R1, '2026-10-07T10:00:00Z', 4)] });
    options = { failWriteOn: ['release_spend'] };
    const summary = await runSpendCreditsSweep(client().client, NOW);
    expect(summary.skipped).toBe('write_failed');
    expect(summary.written).toBe(0);
  });
});

// ---------------------------------------------------------------------------

function release(id: string, releaseDate: string | null, over: Record<string, unknown> = {}) {
  return { id, title: 'Ohema', owner_user_id: 'owner-1', release_date: releaseDate, status: 'draft', metadata: {}, ...over };
}

function paybackDb(releases: Array<Record<string, unknown>>, over: FakeDb = {}): FakeDb {
  return {
    releases,
    release_payback: [],
    profiles: [{ id: 'owner-1', email: 'ada@example.com', name: 'Ada Obi' }],
    ...over,
  };
}

describe('paybackReleaseDayRange', () => {
  it('is the 30-day mark and the two days before it', () => {
    expect(paybackReleaseDayRange(NOW)).toEqual({ from: '2026-09-07', to: '2026-09-09' });
  });
});

describe('runPaybackQuestionSweep', () => {
  it('asks once for a rollout that went out 30 days ago, by push and by email', async () => {
    db = paybackDb([release(R1, '2026-09-09')]);
    const summary = await runPaybackQuestionSweep(client().client, NOW);
    expect(summary).toEqual({ checked: 1, asked: 1 });

    expect(db.release_payback).toHaveLength(1);
    expect(db.release_payback[0]).toMatchObject({ release_id: R1, asked_at: NOW.toISOString() });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][1]).toEqual(['owner-1']);
    expect(push.mock.calls[0][2]).toMatchObject({
      title: 'What did Ohema pay back?',
      url: `/dashboard?release=${R1}&scene=spend`,
      tag: `payback-${R1}`,
    });

    expect(email).toHaveBeenCalledTimes(1);
    expect(email.mock.calls[0][1]).toMatchObject({
      templateId: 'release_payback_question',
      to: 'ada@example.com',
      props: {
        recipientName: 'Ada Obi',
        releaseTitle: 'Ohema',
        spendUrl: `https://my.urganize.app/dashboard?release=${R1}&scene=spend`,
      },
      recipientUserId: 'owner-1',
    });
  });

  it('never asks the same rollout twice, however often it runs', async () => {
    db = paybackDb([release(R1, '2026-09-09')]);
    await runPaybackQuestionSweep(client().client, NOW);
    await runPaybackQuestionSweep(client().client, NOW);
    await runPaybackQuestionSweep(client().client, new Date('2026-10-10T07:00:00Z'));
    expect(db.release_payback).toHaveLength(1);
    expect(push).toHaveBeenCalledTimes(1);
    expect(email).toHaveBeenCalledTimes(1);
  });

  it('does not ask a rollout that already has an answer, and does not overwrite it', async () => {
    db = paybackDb([release(R1, '2026-09-09')], {
      release_payback: [{ release_id: R1, asked_at: 'earlier', amount_kobo: 100, answered_at: 'then' }],
    });
    const summary = await runPaybackQuestionSweep(client().client, NOW);
    expect(summary.asked).toBe(0);
    expect(db.release_payback[0].amount_kobo).toBe(100);
    expect(push).not.toHaveBeenCalled();
  });

  it('covers a missed morning: the day after the mark and the day after that still ask', async () => {
    db = paybackDb([release(R1, '2026-09-08'), release(R2, '2026-09-07', { owner_user_id: 'owner-1' })]);
    const summary = await runPaybackQuestionSweep(client().client, NOW);
    expect(summary.asked).toBe(2);
  });

  it('does not ask too early, too late, without a date, for a throwaway or for a shelved rollout', async () => {
    db = paybackDb([
      release('a', '2026-09-10'), // 29 days ago: not yet
      release('b', '2026-09-06'), // 33 days ago: too late to ask without it being old news
      release('c', null),
      release('d', '2026-09-09', { metadata: { test_release: true } }),
      release('e', '2026-09-09', { status: 'archived' }),
      release('f', '2026-09-09', { owner_user_id: null }),
    ]);
    const summary = await runPaybackQuestionSweep(client().client, NOW);
    expect(summary.asked).toBe(0);
    expect(db.release_payback).toEqual([]);
    expect(push).not.toHaveBeenCalled();
  });

  it('counts the 30 days in Lagos days: the same release is not asked a Lagos day early', async () => {
    // Lagos is UTC+1. At 22:30 UTC on the 9th it is 23:30 on the 9th there, so a
    // release on 10 Sep is only 29 Lagos days old; an hour later it is 00:30 on
    // the 10th and the 30-day mark has come.
    db = paybackDb([release(R1, '2026-09-10')]);
    expect((await runPaybackQuestionSweep(client().client, new Date('2026-10-09T22:30:00Z'))).asked).toBe(0);
    expect((await runPaybackQuestionSweep(client().client, new Date('2026-10-09T23:30:00Z'))).asked).toBe(1);
  });

  it('still asks, and still records it, with email switched off', async () => {
    emailConfigured = false;
    db = paybackDb([release(R1, '2026-09-09')]);
    const summary = await runPaybackQuestionSweep(client().client, NOW);
    expect(summary.asked).toBe(1);
    expect(push).toHaveBeenCalledTimes(1);
    expect(email).not.toHaveBeenCalled();
  });

  it('records the question even when the push and the email both fail, and does not throw', async () => {
    push.mockRejectedValueOnce(new Error('push down'));
    email.mockRejectedValueOnce(new Error('email down'));
    db = paybackDb([release(R1, '2026-09-09')]);
    const summary = await runPaybackQuestionSweep(client().client, NOW);
    expect(summary.asked).toBe(1);
    expect(db.release_payback).toHaveLength(1);
  });

  it('sends nothing when the question could not be recorded', async () => {
    db = paybackDb([release(R1, '2026-09-09')]);
    options = { failWriteOn: ['release_payback'] };
    const summary = await runPaybackQuestionSweep(client().client, NOW);
    expect(summary.asked).toBe(0);
    expect(push).not.toHaveBeenCalled();
    expect(email).not.toHaveBeenCalled();
  });

  it('links to the rollout\'s Spend section', () => {
    expect(paybackUrl(R1)).toBe(`/dashboard?release=${R1}&scene=spend`);
  });
});
