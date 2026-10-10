import { describe, expect, it } from 'vitest';
import {
  buildRunway,
  mrrAtMinor,
  mrrInCurrency,
  mrrWeeklyGrowth,
  parseRunwayInput,
  projectDefaultAlive,
  readStoredRunway,
  RUNWAY_STALE_DAYS,
  type RunwaySettings,
} from './admin-runway';
import {
  defaultAliveFact,
  defaultAliveLabel,
  formatMoney,
  formatOtherCurrency,
  formatRunwayMonths,
  formatWeeklyRate,
  runwayAssumptions,
} from './admin-runway-format';
import { monthlyRecurringMinor, type ScoreboardSubscription } from './scoreboard';

// Runway and default alive (iteration 6, 2026-10-10). Every number the panel
// shows is worked out here, so each rule gets a test.

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(Date.UTC(2026, 9, 10, 12, 0, 0)); // 10 Oct 2026, 12:00 UTC
const iso = (ms: number) => new Date(ms).toISOString();
const daysAgo = (days: number) => iso(NOW.getTime() - days * DAY);
const daysAhead = (days: number) => iso(NOW.getTime() + days * DAY);

function sub(over: Partial<ScoreboardSubscription> & { userId: string }): ScoreboardSubscription {
  return {
    plan: 'manager',
    status: 'active',
    amountMinor: 2_000_000, // ₦20,000 a month
    billingInterval: 'monthly',
    expiresAt: daysAhead(20),
    startedAt: daysAgo(100),
    ...over,
  };
}

function settings(over: Partial<RunwaySettings> = {}): RunwaySettings {
  return {
    currency: 'NGN',
    cash: 1_200_000,
    monthlyBurn: 200_000,
    asOf: '2026-10-10',
    ngnPerUsd: null,
    updatedAt: null,
    ...over,
  };
}

describe('parseRunwayInput', () => {
  const good = { currency: 'NGN', cash: '25,000,000', monthlyBurn: 2000000, asOf: '2026-10-10' };

  it('accepts numbers and strings with commas or a currency sign, rounded to kobo', () => {
    expect(parseRunwayInput({ ...good, cash: '₦25,000,000.456' }, NOW)).toEqual({
      ok: true,
      value: { currency: 'NGN', cash: 25_000_000.46, monthlyBurn: 2_000_000, asOf: '2026-10-10', ngnPerUsd: null },
    });
  });

  it('takes the currency in any case', () => {
    expect(parseRunwayInput({ ...good, currency: 'ngn' }, NOW)).toMatchObject({ ok: true, value: { currency: 'NGN' } });
  });

  it.each([
    [{ ...good, currency: 'EUR' }, 'Currency'],
    [{ ...good, cash: -1 }, 'Cash'],
    [{ ...good, cash: 'lots' }, 'Cash'],
    [{ ...good, cash: '1e5' }, 'Cash'],
    [{ ...good, cash: 1e14 }, 'too large'],
    [{ ...good, monthlyBurn: 0 }, 'Monthly spend'],
    [{ ...good, monthlyBurn: null }, 'Monthly spend'],
    [{ ...good, monthlyBurn: 1e13 }, 'too large'],
    [{ ...good, asOf: '2026-02-30' }, 'real day'],
    [{ ...good, asOf: '10/10/2026' }, 'real day'],
    [{ ...good, asOf: '2026-10-12' }, 'future'],
    [{ ...good, asOf: '2019-12-31' }, 'too far'],
    [{ ...good, ngnPerUsd: 0 }, 'Naira per dollar'],
    [{ ...good, ngnPerUsd: 'abc' }, 'Naira per dollar'],
    [{ ...good, currency: 'USD' }, 'Naira per dollar'],
    [null, 'Send'],
    [[1, 2], 'Send'],
    ['text', 'Send'],
  ])('refuses %j', (body, words) => {
    const result = parseRunwayInput(body, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(words);
  });

  it("allows tomorrow (the founder's today can be UTC's tomorrow)", () => {
    expect(parseRunwayInput({ ...good, asOf: '2026-10-11' }, NOW).ok).toBe(true);
  });

  it('needs a rate with dollars and keeps an optional one with Naira', () => {
    expect(parseRunwayInput({ ...good, currency: 'USD', ngnPerUsd: '1,500' }, NOW)).toMatchObject({
      ok: true,
      value: { currency: 'USD', ngnPerUsd: 1500 },
    });
    expect(parseRunwayInput({ ...good, ngnPerUsd: '' }, NOW)).toMatchObject({ ok: true, value: { ngnPerUsd: null } });
    expect(parseRunwayInput({ ...good, ngnPerUsd: 1480 }, NOW)).toMatchObject({ ok: true, value: { ngnPerUsd: 1480 } });
  });

  it('allows zero cash (the honest answer is then "out of money")', () => {
    expect(parseRunwayInput({ ...good, cash: 0 }, NOW)).toMatchObject({ ok: true, value: { cash: 0 } });
  });
});

describe('readStoredRunway', () => {
  it('reads back what was saved, with its time', () => {
    const stored = { currency: 'USD', cash: 20000, monthlyBurn: 1500, asOf: '2026-10-01', ngnPerUsd: 1500, updatedAt: daysAgo(1) };
    expect(readStoredRunway(stored, NOW)).toEqual(stored);
  });

  it('reads a broken stored value as nothing stored, never as zeros', () => {
    expect(readStoredRunway({ currency: 'NGN', cash: 'x' }, NOW)).toBeNull();
    expect(readStoredRunway(null, NOW)).toBeNull();
  });
});

describe('MRR history', () => {
  it('rebuilds MRR at a moment from each stretch of paying', () => {
    const subs = [
      sub({ userId: 'old' }),
      sub({ userId: 'new', startedAt: daysAgo(10) }),
      sub({ userId: 'gone', status: 'expired', startedAt: daysAgo(90), expiresAt: daysAgo(20) }),
    ];
    expect(mrrAtMinor(subs, NOW.getTime(), NOW)).toBe(4_000_000);
    expect(mrrAtMinor(subs, NOW.getTime() - 28 * DAY, NOW)).toBe(4_000_000); // old + gone
    expect(mrrAtMinor(subs, NOW.getTime() - 5 * DAY, NOW)).toBe(4_000_000); // old + new
  });

  it('equals the Scoreboard MRR today when nothing is cancelled', () => {
    const subs = [sub({ userId: 'a' }), sub({ userId: 'b', amountMinor: 1_200_000, billingInterval: 'annual' })];
    expect(mrrAtMinor(subs, NOW.getTime(), NOW)).toBe(monthlyRecurringMinor(subs, NOW));
  });

  it('compounds the 4-week change into a weekly rate', () => {
    // 1 subscription 4 weeks ago, 2 now: (2/1)^(1/4) - 1.
    const subs = [sub({ userId: 'a' }), sub({ userId: 'b', startedAt: daysAgo(3) })];
    const growth = mrrWeeklyGrowth(subs, NOW);
    expect(growth.mrrThenMinor).toBe(2_000_000);
    expect(growth.mrrNowMinor).toBe(4_000_000);
    expect(growth.weeklyRate).toBeCloseTo(Math.pow(2, 0.25) - 1, 10);
  });

  it('has no rate when there was no MRR 4 weeks ago', () => {
    const growth = mrrWeeklyGrowth([sub({ userId: 'a', startedAt: daysAgo(3) })], NOW);
    expect(growth.weeklyRate).toBeNull();
  });

  it('can shrink', () => {
    const subs = [sub({ userId: 'a' }), sub({ userId: 'b', status: 'expired', expiresAt: daysAgo(10) })];
    expect(mrrWeeklyGrowth(subs, NOW).weeklyRate).toBeCloseTo(Math.pow(0.5, 0.25) - 1, 10);
  });
});

describe('mrrInCurrency', () => {
  it('turns kobo into Naira, or dollars at the typed rate', () => {
    expect(mrrInCurrency(150_000_00, { currency: 'NGN', ngnPerUsd: null })).toBe(150_000);
    expect(mrrInCurrency(150_000_00, { currency: 'USD', ngnPerUsd: 1500 })).toBe(100);
    expect(mrrInCurrency(150_000_00, { currency: 'USD', ngnPerUsd: null })).toBeNull();
  });
});

describe('projectDefaultAlive', () => {
  it('is alive at once when MRR already covers spend', () => {
    expect(projectDefaultAlive({ cash: 0, monthlyBurn: 100, mrr: 100, weeklyGrowth: 0 })).toEqual({
      status: 'alive',
      weeksToProfit: 0,
      weeksToCashOut: null,
    });
  });

  it('is dead with flat MRR below spend, when the cash runs out', () => {
    // Net burn 52 a month = 12 a week; 120 of cash lasts 10 weeks.
    expect(projectDefaultAlive({ cash: 120, monthlyBurn: 100, mrr: 48, weeklyGrowth: 0 })).toEqual({
      status: 'dead',
      weeksToProfit: null,
      weeksToCashOut: 10,
    });
  });

  it('is dead straight away with no cash and no profit', () => {
    expect(projectDefaultAlive({ cash: 0, monthlyBurn: 100, mrr: 50, weeklyGrowth: 0.5 })).toMatchObject({
      status: 'dead',
      weeksToCashOut: 0,
    });
  });

  it('is alive when growth gets MRR past spend before the cash is gone', () => {
    // MRR 50 doubling weekly passes 100 in week 1; cash easily covers one week.
    expect(projectDefaultAlive({ cash: 1000, monthlyBurn: 100, mrr: 50, weeklyGrowth: 1 })).toEqual({
      status: 'alive',
      weeksToProfit: 1,
      weeksToCashOut: null,
    });
  });

  it('is dead when growth is too slow for the cash', () => {
    const result = projectDefaultAlive({ cash: 50, monthlyBurn: 100, mrr: 10, weeklyGrowth: 0.01 });
    expect(result.status).toBe('dead');
    expect(result.weeksToCashOut).toBeGreaterThan(0);
  });

  it('matches a hand-worked week by week case', () => {
    // Spend 52/month = 12/week. MRR 26 (6/week) grows 50% a week:
    // week 0: MRR 26 < 52, cash 30 - (52-26)*12/52 = 24, MRR -> 39
    // week 1: 39 < 52, cash 24 - 13*12/52 = 21, MRR -> 58.5
    // week 2: 58.5 >= 52 -> alive in week 2.
    expect(projectDefaultAlive({ cash: 30, monthlyBurn: 52, mrr: 26, weeklyGrowth: 0.5 })).toEqual({
      status: 'alive',
      weeksToProfit: 2,
      weeksToCashOut: null,
    });
    // Same, but 5 of cash runs out in week 1.
    expect(projectDefaultAlive({ cash: 5, monthlyBurn: 52, mrr: 26, weeklyGrowth: 0.5 })).toEqual({
      status: 'dead',
      weeksToProfit: null,
      weeksToCashOut: 1,
    });
  });

  it('says neither when neither happens inside the horizon', () => {
    expect(projectDefaultAlive({ cash: 1e9, monthlyBurn: 100, mrr: 99, weeklyGrowth: 0, horizonWeeks: 10 })).toEqual({
      status: 'beyond_horizon',
      weeksToProfit: null,
      weeksToCashOut: null,
    });
  });

  it('never lets MRR go below zero, even shrinking faster than -100%', () => {
    expect(projectDefaultAlive({ cash: 24, monthlyBurn: 52, mrr: 26, weeklyGrowth: -5 })).toMatchObject({ status: 'dead' });
  });
});

describe('buildRunway', () => {
  const subs = [sub({ userId: 'a', amountMinor: 50_000_00 })]; // ₦50,000 MRR, flat for 4 weeks

  it('has an empty state with nothing entered', () => {
    const runway = buildRunway(null, { subscriptions: subs, mrrMinor: 50_000_00, now: NOW });
    expect(runway).toMatchObject({ settings: null, months: null, defaultAlive: null, stale: false });
    expect(formatRunwayMonths(runway)).toBe('Not entered');
    expect(defaultAliveLabel(runway)).toBe('Not worked out');
  });

  it('works out runway as cash / (spend - MRR) in Naira', () => {
    const runway = buildRunway(settings(), { subscriptions: subs, mrrMinor: 50_000_00, now: NOW });
    expect(runway.mrr).toBe(50_000);
    expect(runway.netBurn).toBe(150_000);
    expect(runway.months).toBe(8);
    // 8 months of 52/12 weeks = 242.67 days -> 243 days after 10 Oct.
    expect(runway.runsOutOn).toBe('2027-06-10');
    expect(runway.growth.weeklyRate).toBe(0);
    expect(runway.defaultAlive?.status).toBe('dead');
    expect(formatRunwayMonths(runway)).toBe('8.0 months');
  });

  it('works in dollars with MRR turned into dollars at the typed rate', () => {
    const runway = buildRunway(
      settings({ currency: 'USD', cash: 10_000, monthlyBurn: 1_100, ngnPerUsd: 500 }),
      { subscriptions: subs, mrrMinor: 50_000_00, now: NOW }
    );
    expect(runway.mrr).toBe(100);
    expect(runway.netBurn).toBe(1_000);
    expect(runway.months).toBe(10);
  });

  it('is not burning when MRR covers spend, and alive at once', () => {
    const runway = buildRunway(settings({ monthlyBurn: 40_000 }), { subscriptions: subs, mrrMinor: 50_000_00, now: NOW });
    expect(runway.months).toBeNull();
    expect(runway.runsOutOn).toBeNull();
    expect(formatRunwayMonths(runway)).toBe('Not burning cash');
    expect(runway.defaultAlive).toMatchObject({ status: 'alive', weeksToProfit: 0, profitOn: '2026-10-10' });
    expect(defaultAliveLabel(runway)).toBe('Alive: MRR covers spend');
  });

  it('projects at MRR’s own 4-week rate and dates the answer from the as-of day', () => {
    const growing = [sub({ userId: 'a' }), sub({ userId: 'b', startedAt: daysAgo(3) })]; // doubled in 4 weeks
    const runway = buildRunway(settings({ cash: 10_000_000, monthlyBurn: 200_000 }), {
      subscriptions: growing,
      mrrMinor: 4_000_000,
      now: NOW,
    });
    expect(runway.growth.weeklyRate).toBeCloseTo(Math.pow(2, 0.25) - 1, 10);
    expect(runway.defaultAlive?.status).toBe('alive');
    const weeks = runway.defaultAlive?.weeksToProfit ?? 0;
    // ₦40,000 x 1.189^w >= ₦200,000 first at w = 10.
    expect(weeks).toBe(10);
    expect(runway.defaultAlive?.profitOn).toBe('2026-12-19');
    expect(defaultAliveLabel(runway)).toBe('Default alive');
    expect(defaultAliveFact(runway)).toContain('before the cash runs out');
  });

  it('assumes flat MRR when there is no rate yet, and says so', () => {
    const fresh = [sub({ userId: 'a', startedAt: daysAgo(3), amountMinor: 50_000_00 })];
    const runway = buildRunway(settings(), { subscriptions: fresh, mrrMinor: 50_000_00, now: NOW });
    expect(runway.growth.weeklyRate).toBeNull();
    expect(runway.growth.usedRate).toBe(0);
    expect(runwayAssumptions(runway)).toContain('assumes MRR stays where it is');
  });

  it('flags figures older than the stale line', () => {
    const asOf = new Date(NOW.getTime() - (RUNWAY_STALE_DAYS + 1) * DAY).toISOString().slice(0, 10);
    const runway = buildRunway(settings({ asOf }), { subscriptions: subs, mrrMinor: 50_000_00, now: NOW });
    expect(runway.ageDays).toBe(RUNWAY_STALE_DAYS + 1);
    expect(runway.stale).toBe(true);
    expect(buildRunway(settings(), { subscriptions: subs, mrrMinor: 50_000_00, now: NOW }).stale).toBe(false);
  });

  it('does not work out dollar figures without a rate (never compares unlike money)', () => {
    const runway = buildRunway(settings({ currency: 'USD', ngnPerUsd: null }), {
      subscriptions: subs,
      mrrMinor: 50_000_00,
      now: NOW,
    });
    expect(runway.mrr).toBeNull();
    expect(runway.months).toBeNull();
    expect(runway.defaultAlive).toBeNull();
    expect(formatRunwayMonths(runway)).toBe('Not worked out');
  });
});

describe('runway words', () => {
  it('formats money in either currency', () => {
    expect(formatMoney(25_000_000, 'NGN')).toBe('₦25,000,000');
    expect(formatMoney(1234.6, 'USD')).toBe('$1,235');
    expect(formatMoney(-500, 'NGN')).toBe('-₦500');
  });

  it('shows the other currency only with a rate', () => {
    expect(formatOtherCurrency(3_000_000, { currency: 'NGN', ngnPerUsd: 1500 })).toBe('≈ $2,000');
    expect(formatOtherCurrency(2_000, { currency: 'USD', ngnPerUsd: 1500 })).toBe('≈ ₦3,000,000');
    expect(formatOtherCurrency(2_000, { currency: 'NGN', ngnPerUsd: null })).toBeNull();
  });

  it('formats the weekly rate', () => {
    expect(formatWeeklyRate(null)).toBe('No rate yet');
    expect(formatWeeklyRate(0.0512)).toBe('+5.1% a week');
    expect(formatWeeklyRate(-0.02)).toBe('-2% a week');
    expect(formatWeeklyRate(0)).toBe('0% a week');
  });

  it('puts the rate and the currency rule in the assumptions', () => {
    const runway = buildRunway(settings({ currency: 'USD', cash: 10_000, monthlyBurn: 1_100, ngnPerUsd: 1500 }), {
      subscriptions: [sub({ userId: 'a' })],
      mrrMinor: 2_000_000,
      now: NOW,
    });
    const words = runwayAssumptions(runway);
    expect(words).toContain('₦1,500 per $1');
    expect(words).toContain('MRR growth used: 0% a week');
    expect(words).toContain('Paul Graham');
  });
});
