import { describe, expect, it } from 'vitest';
import { churnSummary, inRenewalGrace, monthStarts, payingStretch, CHURN_COMPLETE_MONTHS, RENEWAL_GRACE_MS } from './admin-churn';
import { PAYSTACK_RETRY_GRACE_DAYS } from './billing-plans';
import { formatMonth, logoChurnVerdict, NOT_TRACKED_NET } from './admin-churn-format';
import {
  monthlyRecurringMinor,
  type ScoreboardInput,
  type ScoreboardSubscription,
  type ScoreboardTeam,
} from './scoreboard';

// "Now" is 10 Oct 2026, so the months are Jul, Aug, Sep (complete) and Oct so far.
const NOW = new Date('2026-10-10T12:00:00.000Z');

function sub(over: Partial<ScoreboardSubscription> & { userId: string }): ScoreboardSubscription {
  return {
    plan: 'manager',
    status: 'active',
    amountMinor: 2_000_000,
    billingInterval: 'monthly',
    expiresAt: '2026-11-01T00:00:00.000Z',
    startedAt: '2026-05-01T00:00:00.000Z',
    ...over,
  };
}

function team(id: string, subscription: ScoreboardSubscription | null, over: Partial<ScoreboardTeam> = {}): ScoreboardTeam {
  return {
    workspaceId: id,
    name: id,
    ownerUserId: subscription?.userId ?? `${id}-owner`,
    createdAt: '2026-04-01T00:00:00.000Z',
    ownerSignedUpAt: '2026-04-01T00:00:00.000Z',
    memberUserIds: [],
    firstInviteAt: null,
    state: 'paid',
    comped: false,
    allowlisted: false,
    subscription,
    trialStartedAt: null,
    trialEndsAt: null,
    ownerPaidAt: null,
    ...over,
  };
}

function input(teams: ScoreboardTeam[], subscriptions?: ScoreboardSubscription[]): ScoreboardInput {
  return {
    now: NOW,
    teams,
    releases: [],
    subscriptions: subscriptions ?? teams.flatMap((t) => (t.subscription ? [t.subscription] : [])),
    activity: new Map(),
    activityTruncated: false,
  };
}

describe('monthStarts', () => {
  it('gives the complete months then this one, across a year end', () => {
    expect(monthStarts(NOW, 3).map((value) => new Date(value).toISOString().slice(0, 10))).toEqual([
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
    ]);
    expect(
      monthStarts(new Date('2027-01-31T10:00:00.000Z'), 2).map((value) => new Date(value).toISOString().slice(0, 10))
    ).toEqual(['2026-11-01', '2026-12-01', '2027-01-01']);
  });

  it('does not skip February on the 31st', () => {
    expect(
      monthStarts(new Date('2026-03-31T10:00:00.000Z'), 1).map((value) => new Date(value).toISOString().slice(0, 10))
    ).toEqual(['2026-02-01', '2026-03-01']);
  });
});

describe('payingStretch', () => {
  it('runs from started_at to now while current', () => {
    expect(payingStretch(sub({ userId: 'a' }), NOW)).toEqual({
      from: Date.parse('2026-05-01T00:00:00.000Z'),
      until: null,
      monthlyMinor: 2_000_000,
    });
  });

  it('ends on the last paid day once it has passed', () => {
    const stretch = payingStretch(sub({ userId: 'a', status: 'expired', expiresAt: '2026-09-15T00:00:00.000Z' }), NOW);
    expect(stretch).toMatchObject({ until: Date.parse('2026-09-15T00:00:00.000Z') });
  });

  it('treats an active row past its paid day as stopped (renewal never came)', () => {
    const stretch = payingStretch(sub({ userId: 'a', status: 'active', expiresAt: '2026-08-20T00:00:00.000Z' }), NOW);
    expect(stretch).toMatchObject({ until: Date.parse('2026-08-20T00:00:00.000Z') });
  });

  it('counts yearly plans at a twelfth, like MRR', () => {
    const stretch = payingStretch(sub({ userId: 'a', billingInterval: 'annual', amountMinor: 1_200_000 }), NOW);
    expect(stretch).toMatchObject({ monthlyMinor: 100_000 });
  });

  it('ignores rows that never paid', () => {
    expect(payingStretch(sub({ userId: 'a', amountMinor: 0 }), NOW)).toBeNull();
    expect(payingStretch(sub({ userId: 'a', amountMinor: null }), NOW)).toBeNull();
    expect(payingStretch(sub({ userId: 'a', status: 'trialing' }), NOW)).toBeNull();
  });

  it('says undated when a date it needs is not stored', () => {
    expect(payingStretch(sub({ userId: 'a', startedAt: null }), NOW)).toBe('undated');
    expect(payingStretch(sub({ userId: 'a', startedAt: undefined }), NOW)).toBe('undated');
    // Stopped by hand while still paid up: when it stopped is not stored.
    expect(payingStretch(sub({ userId: 'a', status: 'inactive', expiresAt: '2026-12-01T00:00:00.000Z' }), NOW)).toBe(
      'undated'
    );
  });
});

describe('churnSummary', () => {
  it('counts teams lost in each month out of the teams paying at its start', () => {
    const teams = [
      team('stays', sub({ userId: 'u1' })),
      team('stays-2', sub({ userId: 'u2' })),
      team('stays-3', sub({ userId: 'u3' })),
      team('left-sep', sub({ userId: 'u4', status: 'expired', expiresAt: '2026-09-12T00:00:00.000Z' })),
      team('left-oct', sub({ userId: 'u5', status: 'cancelled', expiresAt: '2026-10-03T00:00:00.000Z' })),
    ];
    const summary = churnSummary(input(teams));
    expect(summary.months.map((m) => m.month)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
    expect(summary.months.map((m) => m.complete)).toEqual([true, true, true, false]);

    const [jul, aug, sep, oct] = summary.months;
    expect(jul).toMatchObject({ payingTeamsAtStart: 5, teamsLost: 0, logoChurn: 0 });
    expect(aug).toMatchObject({ payingTeamsAtStart: 5, teamsLost: 0 });
    expect(sep).toMatchObject({ payingTeamsAtStart: 5, teamsLost: 1, logoChurn: 0.2 });
    expect(oct).toMatchObject({ payingTeamsAtStart: 4, teamsLost: 1, logoChurn: 0.25 });
    expect(oct.endsAt).toBe(NOW.toISOString());
  });

  it('does not count a team that started paying during the month at its start', () => {
    const teams = [
      team('old', sub({ userId: 'u1' })),
      team('new', sub({ userId: 'u2', startedAt: '2026-09-10T00:00:00.000Z' })),
      // Joined and left inside September: never paying at a month start.
      team('blip', sub({ userId: 'u3', startedAt: '2026-09-02T00:00:00.000Z', status: 'expired', expiresAt: '2026-09-20T00:00:00.000Z' })),
    ];
    const [, , sep, oct] = churnSummary(input(teams)).months;
    expect(sep).toMatchObject({ payingTeamsAtStart: 1, teamsLost: 0 });
    expect(oct).toMatchObject({ payingTeamsAtStart: 2, teamsLost: 0 });
  });

  it('uses the Scoreboard paying-team rule: no Solo, no comped, no allowlisted', () => {
    const teams = [
      team('solo', sub({ userId: 'u1', plan: 'solo', status: 'expired', expiresAt: '2026-09-05T00:00:00.000Z' })),
      team('comped', sub({ userId: 'u2', status: 'expired', expiresAt: '2026-09-05T00:00:00.000Z' }), { comped: true }),
      team('us', sub({ userId: 'u3', status: 'expired', expiresAt: '2026-09-05T00:00:00.000Z' }), { allowlisted: true }),
      team('real', sub({ userId: 'u4', status: 'expired', expiresAt: '2026-09-05T00:00:00.000Z' })),
    ];
    const sep = churnSummary(input(teams)).months[2];
    expect(sep).toMatchObject({ payingTeamsAtStart: 1, teamsLost: 1, logoChurn: 1 });
  });

  it('counts MRR over every paid subscription, Solo included, as MRR does', () => {
    const solo = sub({ userId: 'solo', plan: 'solo', amountMinor: 800_000, status: 'expired', expiresAt: '2026-09-05T00:00:00.000Z' });
    const label = sub({ userId: 'label', plan: 'label', amountMinor: 6_000_000, billingInterval: 'annual' });
    const manager = sub({ userId: 'manager', amountMinor: 2_200_000 });
    const sep = churnSummary(input([], [solo, label, manager])).months[2];
    expect(sep.mrrAtStartMinor).toBe(800_000 + 500_000 + 2_200_000);
    expect(sep.mrrLostMinor).toBe(800_000);
    expect(sep.grossMrrChurn).toBeCloseTo(800_000 / 3_500_000);
  });

  it("matches the Scoreboard's MRR at the start of this month when nothing changed since", () => {
    const subs = [
      sub({ userId: 'a', amountMinor: 2_200_000 }),
      sub({ userId: 'b', plan: 'label', amountMinor: 6_000_000, billingInterval: 'annual' }),
    ];
    const oct = churnSummary(input([], subs)).months[3];
    expect(oct.mrrAtStartMinor).toBe(monthlyRecurringMinor(subs, NOW));
  });

  it('shows no rate, never a zero, when nobody was paying', () => {
    const summary = churnSummary(input([]));
    for (const month of summary.months) {
      expect(month.logoChurn).toBeNull();
      expect(month.grossMrrChurn).toBeNull();
    }
  });

  it('leaves net revenue retention and net MRR churn as not tracked, with the reason', () => {
    const summary = churnSummary(input([team('a', sub({ userId: 'a' }))]));
    expect(summary.netRevenueRetention).toBeNull();
    expect(summary.netMrrChurn).toBeNull();
    expect(summary.netNotTrackedReason).toBe(NOT_TRACKED_NET);
  });

  it('counts paid rows it cannot place in time instead of guessing', () => {
    const summary = churnSummary(input([], [sub({ userId: 'a', startedAt: null }), sub({ userId: 'b' })]));
    expect(summary.undated).toBe(1);
    expect(summary.months[3].mrrAtStartMinor).toBe(2_000_000);
  });

  it('shows the configured number of complete months', () => {
    expect(churnSummary(input([])).months).toHaveLength(CHURN_COMPLETE_MONTHS + 1);
  });

  it('does not change its input', () => {
    const data = input([team('a', sub({ userId: 'a', status: 'expired', expiresAt: '2026-09-05T00:00:00.000Z' }))]);
    const before = JSON.stringify({ ...data, activity: [...data.activity] });
    churnSummary(data);
    expect(JSON.stringify({ ...data, activity: [...data.activity] })).toBe(before);
  });
});

describe('churn words', () => {
  it("judges logo churn against Lenny's B2B SMB bars", () => {
    expect(logoChurnVerdict(null)).toBe('No paying teams at the start of the month');
    expect(logoChurnVerdict(0)).toBe('Great: under 1.5% a month');
    expect(logoChurnVerdict(0.03)).toBe('Good: 5% a month or less');
    expect(logoChurnVerdict(0.05)).toBe('Good: 5% a month or less');
    expect(logoChurnVerdict(0.2)).toBe('High: over 5% a month');
  });

  it('names a month', () => {
    expect(formatMonth('2026-09')).toMatch(/^Sept? 2026$/);
    expect(formatMonth('2027-01')).toBe('Jan 2027');
    expect(formatMonth('nonsense')).toBe('nonsense');
  });
});

describe("renewal grace: Paystack's retries before a failed renewal counts as churn (iteration 6)", () => {
  const HOUR = 60 * 60 * 1000;
  const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * HOUR).toISOString();

  it('is the 3 days Paystack retries for', () => {
    expect(PAYSTACK_RETRY_GRACE_DAYS).toBe(3);
    expect(RENEWAL_GRACE_MS).toBe(3 * 24 * HOUR);
  });

  it('keeps a failed renewal (past_due) paying for 3 days after its last paid day', () => {
    const failed = sub({ userId: 'a', status: 'past_due', expiresAt: hoursAgo(30) });
    expect(inRenewalGrace(failed, NOW)).toBe(true);
    expect(payingStretch(failed, NOW)).toMatchObject({ until: null });
  });

  it('gives the same grace to an active row whose renewal has not landed yet', () => {
    const pending = sub({ userId: 'a', status: 'active', expiresAt: hoursAgo(2) });
    expect(payingStretch(pending, NOW)).toMatchObject({ until: null });
  });

  it('counts it lost on its last paid day once the 3 days are over', () => {
    const lapsed = sub({ userId: 'a', status: 'past_due', expiresAt: hoursAgo(72 + 1) });
    expect(inRenewalGrace(lapsed, NOW)).toBe(false);
    expect(payingStretch(lapsed, NOW)).toMatchObject({ until: Date.parse(hoursAgo(73)) });
    // Exactly at the edge the grace is over.
    expect(inRenewalGrace(sub({ userId: 'a', status: 'past_due', expiresAt: hoursAgo(72) }), NOW)).toBe(false);
  });

  it('gives no grace to a cancelled subscription, which was never going to renew', () => {
    const cancelled = sub({ userId: 'a', status: 'cancelled', expiresAt: hoursAgo(5) });
    expect(inRenewalGrace(cancelled, NOW)).toBe(false);
    expect(payingStretch(cancelled, NOW)).toMatchObject({ until: Date.parse(hoursAgo(5)) });
  });

  it('is not lost this month while Paystack is still retrying, and is once it gives up', () => {
    const inGrace = team('retrying', sub({ userId: 'u1', status: 'past_due', expiresAt: hoursAgo(24) }));
    const gaveUp = team('gave-up', sub({ userId: 'u2', status: 'past_due', expiresAt: hoursAgo(24 * 4) }));
    const oct = churnSummary(input([inGrace, gaveUp])).months[3];
    expect(oct).toMatchObject({ payingTeamsAtStart: 2, teamsLost: 1, logoChurn: 0.5 });
    expect(oct.mrrLostMinor).toBe(2_000_000);
  });

  it('puts a loss found after the grace in the month the last paid day fell in', () => {
    // Last paid day 30 Sep, 10 days before now: grace long over, lost in September.
    const lapsed = team('late', sub({ userId: 'u1', status: 'past_due', expiresAt: '2026-09-30T22:00:00.000Z' }));
    const [, , sep, oct] = churnSummary(input([lapsed])).months;
    expect(sep).toMatchObject({ teamsLost: 1 });
    expect(oct).toMatchObject({ payingTeamsAtStart: 0, teamsLost: 0 });
  });
});
