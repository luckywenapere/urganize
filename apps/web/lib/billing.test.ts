import { describe, expect, it } from 'vitest';
import { getPlanExpiry } from './billing';

// Dates are constructed with the local-time Date(y, m, d) constructor so the
// assertions are timezone-independent — getPlanExpiry mutates via setMonth/
// setFullYear, which operate in local time.

describe('getPlanExpiry', () => {
  it('monthly advances one month', () => {
    const now = new Date(2026, 0, 15); // Jan 15
    expect(getPlanExpiry('monthly', now).getTime()).toBe(new Date(2026, 1, 15).getTime());
  });

  it('unknown plan strings fall back to the monthly default', () => {
    const now = new Date(2026, 0, 15);
    expect(getPlanExpiry('something-new', now).getTime()).toBe(new Date(2026, 1, 15).getTime());
  });

  it('month-end rollover follows JS setMonth semantics (Jan 31 + 1mo lands in March)', () => {
    // Documents existing behavior: Jan 31 → "Feb 31" → Mar 3 (non-leap 2026).
    // A user charged on the 31st gets 31 days, not a truncated month.
    const now = new Date(2026, 0, 31);
    expect(getPlanExpiry('monthly', now).getTime()).toBe(new Date(2026, 2, 3).getTime());
  });

  it.each(['annual', 'label', 'yearly', 'access'])('%s advances one year', (plan) => {
    const now = new Date(2026, 5, 10);
    expect(getPlanExpiry(plan, now).getTime()).toBe(new Date(2027, 5, 10).getTime());
  });

  it('custom (admin-provisioned) is pegged far-future: +100 years', () => {
    const now = new Date(2026, 5, 10);
    expect(getPlanExpiry('custom', now).getTime()).toBe(new Date(2126, 5, 10).getTime());
  });

  it('does not mutate the passed-in date', () => {
    const now = new Date(2026, 0, 15);
    const snapshot = now.getTime();
    getPlanExpiry('annual', now);
    expect(now.getTime()).toBe(snapshot);
  });
});

// ── Pricing v2: the plan no longer says how long a period is ────────────────
//
// THE BUG THIS CLOSES. A tier id ('manager' / 'label') carries no interval, so
// name-matching alone gave a Label-monthly buyer a full year of access for one
// month's money, and a Manager-annual buyer one month for a year's. The
// interval now travels with the charge.

describe('getPlanExpiry — tier plans', () => {
  const now = new Date(2026, 5, 10); // Jun 10

  it('gives the same tier a month or a year depending on what was bought', () => {
    expect(getPlanExpiry('label', now, 'monthly').getTime()).toBe(new Date(2026, 6, 10).getTime());
    expect(getPlanExpiry('label', now, 'annual').getTime()).toBe(new Date(2027, 5, 10).getTime());
    expect(getPlanExpiry('manager', now, 'monthly').getTime()).toBe(new Date(2026, 6, 10).getTime());
    expect(getPlanExpiry('manager', now, 'annual').getTime()).toBe(new Date(2027, 5, 10).getTime());
  });

  it('a stored interval overrides what the plan name would have implied', () => {
    // The whole point: 'label' infers ANNUAL from its name (the legacy roster
    // plan billed yearly), and an explicit monthly interval must beat it.
    expect(getPlanExpiry('label', now).getTime()).toBe(new Date(2027, 5, 10).getTime());
    expect(getPlanExpiry('label', now, 'monthly').getTime()).toBe(new Date(2026, 6, 10).getTime());
  });

  it('falls back to monthly for a tier with no interval recorded', () => {
    // Deliberately the SHORT one. Under-granting a month is recoverable at the
    // next renewal; over-granting a year gives away eleven months for free.
    expect(getPlanExpiry('manager', now).getTime()).toBe(new Date(2026, 6, 10).getTime());
  });

  // 'enterprise' was Group's pricing-v2 id — quoted per contract, invoiced by
  // hand, never charged through self-serve checkout. Group was removed from
  // @urganize/pricing entirely on 2026-09-09, so this is no longer "the
  // sales-led tier gets a long window"; it is a defensive branch for a stray
  // pre-removal row, kept because subscriptions_plan_check still permits the
  // string (see the removal note in packages/pricing/src/index.ts).
  it('pegs a stray "enterprise" row far-future like custom, defensively', () => {
    expect(getPlanExpiry('enterprise', now).getTime()).toBe(new Date(2126, 5, 10).getTime());
    // Even with an interval passed: a hand-negotiated contract term is not a
    // Paystack billing period.
    expect(getPlanExpiry('enterprise', now, 'monthly').getTime()).toBe(
      new Date(2126, 5, 10).getTime()
    );
  });

  it('ignores a malformed interval rather than trusting it', () => {
    // These arrive out of a jsonb column, so anything is possible. Each must
    // fall through to plan-name inference: 'annual' here.
    for (const bogus of ['yearly', 'MONTHLY', 'weekly', '', '  ', null, undefined]) {
      expect(getPlanExpiry('annual', now, bogus).getTime()).toBe(new Date(2027, 5, 10).getTime());
    }
  });

  it('leaves every legacy plan exactly where it was (regression guard)', () => {
    // This is what proves the change is additive: with no interval recorded,
    // every value that can currently sit in subscriptions.plan keeps its
    // historical term.
    const cases: Array<[string, Date]> = [
      ['monthly', new Date(2026, 6, 10)],
      ['annual', new Date(2027, 5, 10)],
      ['yearly', new Date(2027, 5, 10)],
      ['access', new Date(2027, 5, 10)],
      ['label', new Date(2027, 5, 10)],
      ['custom', new Date(2126, 5, 10)],
      ['founding', new Date(2026, 6, 10)],
      ['trial_claim', new Date(2026, 6, 10)],
    ];
    for (const [plan, expected] of cases) {
      expect(getPlanExpiry(plan, now).getTime()).toBe(expected.getTime());
    }
  });
});
