import { describe, expect, it } from 'vitest';
import {
  describePlanName,
  formatBillingDate,
  isContactSalesPlan,
  summarizeBilling,
  type BillingSnapshot,
} from './billing-summary';

const base: BillingSnapshot = {
  accountStatus: 'unpaid',
  plan: null,
  rawStatus: null,
  trialEndsAt: null,
  trialDaysLeft: 0,
  expiresAt: null,
  trialUsed: false,
  allowlisted: false,
};

const snapshot = (overrides: Partial<BillingSnapshot> = {}): BillingSnapshot => ({
  ...base,
  ...overrides,
});

describe('describePlanName', () => {
  it('names the three billing tiers from the shared pricing package', () => {
    expect(describePlanName('monthly')).toBe('Monthly');
    expect(describePlanName('annual')).toBe('Annual');
    expect(describePlanName('label')).toBe('Label');
  });

  it('names the legacy plan values that still exist in production rows', () => {
    expect(describePlanName('access')).toBe('Access');
    expect(describePlanName('custom')).toBe('Custom');
  });

  it('returns null rather than leaking a raw enum for anything unrecognised', () => {
    expect(describePlanName('trial_claim')).toBeNull();
    expect(describePlanName('trial_card')).toBeNull();
    expect(describePlanName('')).toBeNull();
    expect(describePlanName(null)).toBeNull();
  });

  // The load-bearing rule: a price must never be asserted, because the list
  // price in @urganize/pricing is not necessarily what a grandfathered
  // subscriber actually pays.
  it('never returns a currency amount', () => {
    for (const plan of ['monthly', 'annual', 'label', 'access', 'custom']) {
      const name = describePlanName(plan);
      expect(name).not.toMatch(/[₦$]|\d/);
    }
  });
});

describe('isContactSalesPlan', () => {
  it('is true only for the sales-led tier', () => {
    expect(isContactSalesPlan('enterprise')).toBe(true);
    expect(isContactSalesPlan('manager')).toBe(false);
    expect(isContactSalesPlan('monthly')).toBe(false);
    expect(isContactSalesPlan('annual')).toBe(false);
    expect(isContactSalesPlan('access')).toBe(false);
    expect(isContactSalesPlan(null)).toBe(false);
  });

  // CHANGED 2026-08-24, and the direction is the point: this used to assert
  // true. 'label' is the one id that exists in both plan generations — legacy
  // Label was the sales-led ₦800,000 roster plan, tier Label is the self-serve
  // flagship — and a STORED 'label' can only ever be the tier, because the id
  // was not permitted by subscriptions_plan_check until the tier migration
  // added it. Reading it as sales-led sent a paying Label subscriber to a
  // mailto instead of the checkout they were trying to reach.
  it('treats a stored Label plan as self-serve, not sales-led', () => {
    expect(isContactSalesPlan('label')).toBe(false);
  });
});

describe('formatBillingDate', () => {
  it('formats a timestamptz into the app-wide long date shape', () => {
    // Asserted by parts, not a locale-specific string: the app formats with the
    // runtime's own locale, so a hardcoded expectation would be environment-bound.
    const formatted = formatBillingDate('2026-08-25T09:30:00.000Z');
    expect(formatted).toBeTruthy();
    expect(formatted).toContain('2026');
    expect(formatted).toMatch(/2[45]/); // timezone may land either side of midnight
  });

  it('returns null for missing or unparseable input', () => {
    expect(formatBillingDate(null)).toBeNull();
    expect(formatBillingDate('')).toBeNull();
    expect(formatBillingDate('not a date')).toBeNull();
  });
});

describe('summarizeBilling', () => {
  it('puts allowlisted access ahead of status and offers no CTA', () => {
    // An allowlisted account reads back as paid with plan 'allowlist'; a
    // status-first ordering would show it a plan it does not have.
    const result = summarizeBilling(
      snapshot({ allowlisted: true, accountStatus: 'paid', plan: 'allowlist' })
    );
    expect(result.title).toBe('Complimentary access');
    expect(result.cta).toBeNull();
  });

  it('counts down a trial and names its end date', () => {
    const result = summarizeBilling(
      snapshot({ accountStatus: 'trial', trialDaysLeft: 12, trialEndsAt: '2026-08-25T00:00:00.000Z' })
    );
    expect(result.title).toBe('Free trial');
    expect(result.details[0]).toBe('12 days left.');
    expect(result.details[1]).toContain('Ends ');
    expect(result.cta).toBe('plans');
  });

  it('a plain no-card trial offers no cancel control — there is nothing to cancel', () => {
    const result = summarizeBilling(
      snapshot({ accountStatus: 'trial', trialDaysLeft: 12, rawStatus: null })
    );
    expect(result.secondaryCta).toBeNull();
    expect(result.details.join(' ')).not.toContain('starts when your trial ends');
  });

  it('a card-backed trial (rawStatus trialing) names the upcoming plan and offers cancel', () => {
    const result = summarizeBilling(
      snapshot({
        accountStatus: 'trial',
        trialDaysLeft: 27,
        trialEndsAt: '2026-09-15T00:00:00.000Z',
        rawStatus: 'trialing',
        plan: 'monthly',
      })
    );
    expect(result.details).toContain('Monthly plan starts when your trial ends.');
    expect(result.secondaryCta).toBe('cancelTrial');
    // Still no price — the never-print-a-price rule holds here too. (Digits
    // are fine: the countdown and the end date legitimately carry numbers.)
    expect([result.title, ...result.details].join(' ')).not.toMatch(/[₦$]/);
  });

  it('a cancelled card-trial reads as paid with honest copy, not a bare "Active until"', () => {
    // resolveSnapshot path 1 treats cancelled + not-expired as paid; the copy
    // is the one case renewal IS knowable: it will not happen.
    const result = summarizeBilling(
      snapshot({
        accountStatus: 'paid',
        plan: 'monthly',
        rawStatus: 'cancelled',
        expiresAt: '2026-09-15T00:00:00.000Z',
      })
    );
    expect(result.details[0]).toContain('Cancelled — access until ');
    expect(result.secondaryCta).toBeNull();
  });

  it('says a day, singular, on the last day', () => {
    const result = summarizeBilling(snapshot({ accountStatus: 'trial', trialDaysLeft: 1 }));
    expect(result.details[0]).toBe('1 day left.');
  });

  it('says ends today rather than a zero or negative count', () => {
    expect(summarizeBilling(snapshot({ accountStatus: 'trial', trialDaysLeft: 0 })).details[0]).toBe(
      'Ends today.'
    );
    expect(summarizeBilling(snapshot({ accountStatus: 'trial', trialDaysLeft: -3 })).details[0]).toBe(
      'Ends today.'
    );
  });

  it('titles a paid plan by name and offers a change', () => {
    const result = summarizeBilling(
      snapshot({ accountStatus: 'paid', plan: 'monthly', expiresAt: '2026-09-13T00:00:00.000Z' })
    );
    expect(result.title).toBe('Monthly plan');
    expect(result.details[0]).toContain('Active until ');
    expect(result.cta).toBe('change');
  });

  it('says "Active until", never "Renews" — renewal is not knowable from this snapshot', () => {
    const result = summarizeBilling(
      snapshot({ accountStatus: 'paid', plan: 'annual', expiresAt: '2027-08-13T00:00:00.000Z' })
    );
    expect(result.details.join(' ')).not.toMatch(/renew/i);
  });

  it('falls back to a generic paid title for an unrecognised plan', () => {
    const result = summarizeBilling(snapshot({ accountStatus: 'paid', plan: 'trial_claim' }));
    expect(result.title).toBe('Active plan');
  });

  it('routes a sales-led plan to contact, not to the self-serve picker', () => {
    // Group is quoted per contract, so /locked would be a dead end.
    expect(summarizeBilling(snapshot({ accountStatus: 'paid', plan: 'enterprise' })).cta).toBe(
      'contact'
    );
    expect(summarizeBilling(snapshot({ accountStatus: 'expired', plan: 'enterprise' })).cta).toBe(
      'contact'
    );
  });

  it('names a tier plan rather than falling back to the generic title', () => {
    // Before tiers were storable these fell through to 'Active plan', so a
    // paying Manager customer was shown no indication of what they bought.
    expect(summarizeBilling(snapshot({ accountStatus: 'paid', plan: 'manager' })).title).toBe(
      'Manager plan'
    );
    expect(summarizeBilling(snapshot({ accountStatus: 'paid', plan: 'label' })).title).toBe(
      'Label plan'
    );
    // Not 'contact': the exit a paying Label customer gets is "change plan",
    // and a lapsed one gets the picker. Either way, never a mailto.
    expect(summarizeBilling(snapshot({ accountStatus: 'paid', plan: 'label' })).cta).toBe('change');
    expect(summarizeBilling(snapshot({ accountStatus: 'expired', plan: 'label' })).cta).toBe(
      'plans'
    );
  });

  it('reports an expired plan by name with its end date', () => {
    const result = summarizeBilling(
      snapshot({ accountStatus: 'expired', plan: 'annual', expiresAt: '2026-08-01T00:00:00.000Z' })
    );
    expect(result.title).toBe('Annual plan ended');
    expect(result.details[0]).toContain('Ended ');
    expect(result.cta).toBe('plans');
  });

  it('offers the trial to an account that has never used one', () => {
    const result = summarizeBilling(snapshot({ accountStatus: 'unpaid', trialUsed: false }));
    expect(result.title).toBe('No plan yet');
    expect(result.details[0]).toContain('28-day free trial');
    expect(result.details[0]).toContain('no card needed');
    expect(result.cta).toBe('plans');
  });

  it('drops the now-false "no card needed" when the card-trial flag is on', () => {
    const result = summarizeBilling(snapshot({ accountStatus: 'unpaid', trialUsed: false }), {
      cardTrialEnabled: true,
    });
    expect(result.details[0]).toBe('You have a 28-day free trial available.');
    expect(result.details[0]).not.toContain('no card needed');
  });

  it('flag-off copy is byte-identical to the pre-feature copy', () => {
    expect(summarizeBilling(snapshot({ accountStatus: 'unpaid' })).details[0]).toBe(
      'You have a 28-day free trial available, no card needed.'
    );
    expect(
      summarizeBilling(snapshot({ accountStatus: 'unpaid' }), { cardTrialEnabled: false }).details[0]
    ).toBe('You have a 28-day free trial available, no card needed.');
  });

  it('every non-trialing shape defaults secondaryCta to null', () => {
    for (const status of ['paid', 'expired', 'unpaid'] as const) {
      expect(summarizeBilling(snapshot({ accountStatus: status })).secondaryCta).toBeNull();
    }
    expect(
      summarizeBilling(snapshot({ allowlisted: true, accountStatus: 'paid' })).secondaryCta
    ).toBeNull();
  });

  it('does not re-offer a trial that has already been used', () => {
    const result = summarizeBilling(snapshot({ accountStatus: 'unpaid', trialUsed: true }));
    expect(result.details[0]).toBe('Your free trial has finished.');
    expect(result.details.join(' ')).not.toContain('28-day');
  });

  it('omits date lines entirely when the snapshot has no dates', () => {
    for (const status of ['trial', 'paid', 'expired', 'unpaid'] as const) {
      const result = summarizeBilling(snapshot({ accountStatus: status }));
      for (const line of result.details) expect(line).not.toContain('null');
      expect(result.title).toBeTruthy();
    }
  });

  // The paywall gate is off in code today, so the copy must not claim otherwise.
  it('never threatens loss of access', () => {
    for (const status of ['trial', 'paid', 'expired', 'unpaid'] as const) {
      const result = summarizeBilling(snapshot({ accountStatus: status, trialUsed: true }));
      const all = [result.title, ...result.details].join(' ');
      expect(all).not.toMatch(/lose access|locked out|will be locked/i);
    }
  });
});

// Team billing copy (NEXT_PUBLIC_FEATURE_HARD_PAYWALL). Passing `team` makes
// billing a team question; leaving it out must not change a single string
// above, which the untouched tests in this file already prove.
describe('summarizeBilling — team access', () => {
  const team = (overrides: Partial<NonNullable<Parameters<typeof summarizeBilling>[1]>['team']> = {}) => ({
    state: 'trial',
    trialDaysLeft: 6,
    trialEndsAt: '2026-09-01T00:00:00.000Z',
    isOwnerOrAdmin: true,
    teamName: 'Midnight Records',
    ...overrides,
  });

  it('reports the TEAM trial, not the profile trial', () => {
    // The profile says unpaid with no trial; the team says six days left. Under
    // this flag the team is what governs access, so the team must win.
    const result = summarizeBilling(snapshot({ accountStatus: 'unpaid', trialUsed: false }), {
      team: team(),
    });
    expect(result.title).toBe('Free trial');
    expect(result.details[0]).toBe('6 days left.');
    expect(result.details.join(' ')).not.toContain('28-day');
  });

  it('tells an owner the plan covers everyone, and offers them the picker', () => {
    const result = summarizeBilling(snapshot(), { team: team({ isOwnerOrAdmin: true }) });
    expect(result.details.join(' ')).toContain('covers everyone');
    expect(result.cta).toBe('plans');
  });

  it('gives a member no dead CTA, since activating is not theirs to do', () => {
    const result = summarizeBilling(snapshot(), { team: team({ isOwnerOrAdmin: false }) });
    expect(result.details.join(' ')).toContain('team admin');
    expect(result.cta).toBeNull();
  });

  it('handles the singular day', () => {
    const result = summarizeBilling(snapshot(), { team: team({ trialDaysLeft: 1 }) });
    expect(result.details[0]).toBe('1 day left.');
  });

  it('says "Ends today" rather than "0 days left"', () => {
    const result = summarizeBilling(snapshot(), { team: team({ trialDaysLeft: 0 }) });
    expect(result.details[0]).toBe('Ends today.');
  });

  it('describes the grace window as just ended, without a stale countdown', () => {
    const result = summarizeBilling(snapshot(), {
      team: team({ state: 'grace', trialDaysLeft: 0 }),
    });
    expect(result.details[0]).toBe('Your trial has just ended.');
  });

  it('names a comped team as complimentary, with nothing to buy', () => {
    const result = summarizeBilling(snapshot(), { team: team({ state: 'comped' }) });
    expect(result.title).toBe('Complimentary access');
    expect(result.cta).toBeNull();
  });

  it('reassures a walled team that nothing was lost', () => {
    const result = summarizeBilling(snapshot({ accountStatus: 'expired' }), {
      team: team({ state: 'walled' }),
    });
    expect(result.details.join(' ')).toContain('safe and waiting');
    expect(result.cta).toBe('plans');
  });

  it('a paid team falls through to the ordinary paid copy', () => {
    const result = summarizeBilling(
      snapshot({ accountStatus: 'paid', plan: 'annual', expiresAt: '2027-08-21T00:00:00.000Z' }),
      { team: team({ state: 'paid' }) }
    );
    expect(result.title).toContain('Annual');
  });

  // The regression this guard exists for. Money rows are owner-keyed, so a
  // teammate on a paying team reads back 'unpaid' with trialUsed false (the
  // trial route 404s under this flag, so they can never spend one). Before the
  // 'paid' branch they fell all the way through to the no-plan fallback and
  // were offered a free trial their team had already left behind, plus a CTA
  // to the wall.
  it('never offers a trial to a member of a PAYING team', () => {
    for (const isOwnerOrAdmin of [true, false]) {
      const result = summarizeBilling(
        snapshot({ accountStatus: 'unpaid', trialUsed: false }),
        { team: team({ state: 'paid', isOwnerOrAdmin }) }
      );
      const all = [result.title, ...result.details].join(' ');
      expect(all).not.toMatch(/free trial/i);
      expect(all).not.toContain('28');
      expect(all).toContain('active plan');
      // No CTA either: sending them to the picker would show a wall page for a
      // team that pays.
      expect(result.cta).toBeNull();
      expect(result.secondaryCta).toBeNull();
    }
  });

  // ── Read-only (payment failure) ──────────────────────────────────────────
  //
  // A team that PAID and then lapsed. Reads keep working, permanently, so the
  // copy has to say so, and the exit has to be a door that does not bounce:
  // /locked ejects anyone who HAS access, and a read-only team has access.

  it('tells the OWNER their plan ended and sends them somewhere that works', () => {
    const result = summarizeBilling(
      snapshot({
        accountStatus: 'expired',
        plan: 'manager',
        expiresAt: '2026-08-01T00:00:00.000Z',
      }),
      { team: team({ state: 'read_only', isOwnerOrAdmin: true }) }
    );
    // The owner keeps the richer per-user copy: the plan name and the date.
    expect(result.title).toBe('Manager plan ended');
    expect(result.details.join(' ')).toContain('still see everything');
    // 'plans' would land on a bare /locked and bounce straight back.
    expect(result.cta).toBe('reactivate');
  });

  it('never offers a trial to a MEMBER of a read-only team', () => {
    // The same regression the 'paid' branch above exists for: a member's own
    // snapshot reads 'unpaid' with trialUsed false forever, so without a branch
    // they fall through to "you have a 28-day free trial available".
    const result = summarizeBilling(
      snapshot({ accountStatus: 'unpaid', trialUsed: false }),
      { team: team({ state: 'read_only', isOwnerOrAdmin: false }) }
    );
    const all = [result.title, ...result.details].join(' ');
    expect(all).not.toMatch(/free trial/i);
    expect(all).not.toContain('28');
    expect(all).toContain('still see everything');
    expect(all).toMatch(/team admin/i);
    // Nothing for them to click: they cannot pay for the team.
    expect(result.cta).toBeNull();
  });

  it('keeps the ordinary wall copy for a team that only ever trialed', () => {
    const result = summarizeBilling(snapshot({ accountStatus: 'expired' }), {
      team: team({ state: 'walled' }),
    });
    expect(result.cta).toBe('plans');
    expect(result.details.join(' ')).not.toContain('still see everything');
  });

  it('obeys the copy rules: no "workspace", no em dashes, no loss threats', () => {
    for (const state of ['trial', 'grace', 'comped', 'walled', 'paid', 'read_only'] as const) {
      for (const isOwnerOrAdmin of [true, false]) {
        const result = summarizeBilling(snapshot(), { team: team({ state, isOwnerOrAdmin }) });
        const all = [result.title, ...result.details].join(' ');
        expect(all.toLowerCase()).not.toContain('workspace');
        expect(all).not.toContain('—');
        expect(all).not.toMatch(/lose access|locked out|will be locked/i);
      }
    }
  });
});

// ── A pending plan change has to be visible where the team looks ────────────
//
// A downgrade is agreed now and applies at the end of the period. Between those
// two moments Settings would otherwise show only the tier they are leaving, and
// a team that asked to move down and then sees no sign of it would reasonably
// conclude the request was lost.

describe('summarizeBilling — a pending plan change', () => {
  it('names the move and when it happens, above the expiry line', () => {
    const result = summarizeBilling(
      snapshot({
        accountStatus: 'paid',
        plan: 'label',
        pendingPlan: 'manager',
        expiresAt: '2026-09-30T00:00:00.000Z',
      })
    );
    // Still the tier they paid for: a downgrade takes nothing away early.
    expect(result.title).toBe('Label plan');
    expect(result.details[0]).toContain('Moving to Manager');
    // First, not appended: it is the sentence about what happens next.
    expect(result.details[0]).toMatch(/Moving to Manager on /);
    expect(result.details.some((line) => line.startsWith('Active until'))).toBe(true);
  });

  it('says nothing when no change is pending', () => {
    const result = summarizeBilling(
      snapshot({ accountStatus: 'paid', plan: 'label', expiresAt: '2026-09-30T00:00:00.000Z' })
    );
    expect(result.details.some((line) => line.includes('Moving to'))).toBe(false);
  });

  it('stays quiet for an unrecognisable pending value rather than printing it raw', () => {
    const result = summarizeBilling(
      snapshot({
        accountStatus: 'paid',
        plan: 'label',
        pendingPlan: 'platinum',
        expiresAt: '2026-09-30T00:00:00.000Z',
      })
    );
    expect(result.details.some((line) => line.includes('platinum'))).toBe(false);
  });

  it('needs a date before it will promise a move', () => {
    // Without an expiry there is no "when", and "moving to Manager" with no date
    // is worse than saying nothing.
    const result = summarizeBilling(
      snapshot({ accountStatus: 'paid', plan: 'label', pendingPlan: 'manager', expiresAt: null })
    );
    expect(result.details.some((line) => line.includes('Moving to'))).toBe(false);
  });
});
