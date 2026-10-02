import { describe, expect, it } from 'vitest';

import {
  ALLOWANCE_CREDITS,
  CREDIT_SOURCES,
  SPEND_ORDER,
  TRIAL_CREDITS,
  creditAccount,
  monthlyAllowanceCredits,
  splitSpend,
  topupNairaPerCredit,
} from './allowance';
import { isCreditsEnabled } from './config';
import { NAIRA_PER_CREDIT_CREDITS_ONLY, NAIRA_PER_CREDIT_SUBSCRIBER } from './pricing';

describe('the founder rules in numbers', () => {
  it('give a trial 50 credits and the plans 150, 660 and 1,500, Group the same as Label', () => {
    expect(TRIAL_CREDITS).toBe(50);
    expect(ALLOWANCE_CREDITS).toEqual({ solo: 150, manager: 660, label: 1500, enterprise: 1500 });
  });

  it('tag credits with exactly three sources', () => {
    expect([...CREDIT_SOURCES]).toEqual(['trial', 'allowance', 'topup']);
  });
});

describe('creditAccount', () => {
  it('calls a trial, and the short grace after it, a trial', () => {
    expect(creditAccount({ state: 'trial' })).toBe('trial');
    expect(creditAccount({ state: 'grace' })).toBe('trial');
  });

  it('calls a paying or comped team a subscriber', () => {
    expect(creditAccount({ state: 'paid', tier: 'manager' })).toBe('subscriber');
    expect(creditAccount({ state: 'comped' })).toBe('subscriber');
  });

  it('calls everything else credits-only: a trial that ended, a lapsed or cancelled plan, or no information', () => {
    for (const state of ['walled', 'read_only', 'expired', 'unpaid', 'nonsense']) {
      expect(creditAccount({ state }), state).toBe('credits_only');
    }
    expect(creditAccount(undefined)).toBe('credits_only');
    expect(creditAccount({})).toBe('credits_only');
  });
});

describe('monthlyAllowanceCredits', () => {
  it("gives a paying team its plan's allowance", () => {
    expect(monthlyAllowanceCredits({ state: 'paid', tier: 'solo' })).toBe(150);
    expect(monthlyAllowanceCredits({ state: 'paid', tier: 'manager' })).toBe(660);
    expect(monthlyAllowanceCredits({ state: 'paid', tier: 'label' })).toBe(1500);
  });

  it('gives a team that is not subscribed nothing, however big its tier reads', () => {
    // resolveTeamTier reports `label` for a trial so seat limits never bite; reading that as a plan
    // would give every three-day trial the biggest allowance.
    for (const state of ['trial', 'grace', 'read_only', 'walled', 'expired', 'unpaid']) {
      expect(monthlyAllowanceCredits({ state, tier: 'label' }), state).toBe(0);
    }
    expect(monthlyAllowanceCredits(undefined)).toBe(0);
    expect(monthlyAllowanceCredits({})).toBe(0);
  });

  it('gives a comped team the Solo amount, which is the assumption to challenge if wrong', () => {
    expect(monthlyAllowanceCredits({ state: 'comped', tier: 'label' })).toBe(ALLOWANCE_CREDITS.solo);
  });

  it('gives a paying team on a plan it does not recognise the Solo amount, never a free Label one', () => {
    expect(monthlyAllowanceCredits({ state: 'paid', tier: 'platinum' })).toBe(ALLOWANCE_CREDITS.solo);
    expect(monthlyAllowanceCredits({ state: 'paid', tier: null })).toBe(ALLOWANCE_CREDITS.solo);
  });

  it('gives a paying Group team 1,500 a month, and a Group trial nothing monthly', () => {
    expect(monthlyAllowanceCredits({ state: 'paid', tier: 'enterprise' })).toBe(1500);
    expect(monthlyAllowanceCredits({ state: 'trial', tier: 'enterprise' })).toBe(0);
  });

  it('rises with the plan', () => {
    expect(ALLOWANCE_CREDITS.solo).toBeLessThan(ALLOWANCE_CREDITS.manager);
    expect(ALLOWANCE_CREDITS.manager).toBeLessThan(ALLOWANCE_CREDITS.label);
  });
});

describe('what a top-up costs in naira', () => {
  it('is 15 for a subscriber and 30 for an account with no subscription, at 1,500 naira to the dollar', () => {
    expect(NAIRA_PER_CREDIT_SUBSCRIBER).toBe(15);
    expect(NAIRA_PER_CREDIT_CREDITS_ONLY).toBe(30);
    expect(topupNairaPerCredit('subscriber')).toBe(15);
    expect(topupNairaPerCredit('credits_only')).toBe(30);
  });

  it('charges a trial that has not subscribed the dearer price', () => {
    expect(topupNairaPerCredit('trial')).toBe(30);
  });
});

describe('splitSpend', () => {
  it('draws the trial credits first, so what is left of them is exactly what a removal takes', () => {
    expect(SPEND_ORDER[0]).toBe('trial');
    expect(splitSpend(10, { trial: 50, allowance: 100, topup: 5 })).toEqual({ trial: 10, allowance: 0, topup: 0 });
  });

  it('then the allowance, then the top-up', () => {
    expect(splitSpend(30, { trial: 20, allowance: 5, topup: 50 })).toEqual({ trial: 20, allowance: 5, topup: 5 });
    expect(splitSpend(30, { trial: 0, allowance: 20, topup: 50 })).toEqual({ trial: 0, allowance: 20, topup: 10 });
  });

  it('puts an overshoot on the top-up source, where it can be seen and repaid', () => {
    expect(splitSpend(30, { trial: 0, allowance: 0, topup: 5 })).toEqual({ trial: 0, allowance: 0, topup: 30 });
  });

  it('never draws from a negative source, and never a negative or fractional amount', () => {
    expect(splitSpend(10, { trial: -3, allowance: -4, topup: 0 })).toEqual({ trial: 0, allowance: 0, topup: 10 });
    expect(splitSpend(-3, { trial: 5, allowance: 5, topup: 5 })).toEqual({ trial: 0, allowance: 0, topup: 0 });
    expect(splitSpend(2.9, { trial: 5, allowance: 5, topup: 5 })).toEqual({ trial: 2, allowance: 0, topup: 0 });
  });

  it('always adds up to what was asked', () => {
    for (const credits of [0, 1, 7, 150, 999]) {
      for (const trial of [-10, 0, 3, 50]) {
        for (const allowance of [-10, 0, 3, 150, 5000]) {
          const split = splitSpend(credits, { trial, allowance, topup: 10 });
          expect(split.trial + split.allowance + split.topup, `${credits}/${trial}/${allowance}`).toBe(credits);
        }
      }
    }
  });
});

describe('isCreditsEnabled', () => {
  it('is off by default and only the literal word true turns it on', () => {
    expect(isCreditsEnabled({})).toBe(false);
    for (const value of ['', 'false', '1', 'yes', 'on']) {
      expect(isCreditsEnabled({ NEXT_PUBLIC_FEATURE_URGANS_CREDITS: value }), value).toBe(false);
    }
    expect(isCreditsEnabled({ NEXT_PUBLIC_FEATURE_URGANS_CREDITS: 'true' })).toBe(true);
    expect(isCreditsEnabled({ NEXT_PUBLIC_FEATURE_URGANS_CREDITS: ' TRUE ' })).toBe(true);
  });
});
