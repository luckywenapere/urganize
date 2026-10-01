import { describe, expect, it } from 'vitest';

import { ALLOWANCE_CREDITS, TRIAL_ALLOWANCE_CREDITS, monthlyAllowanceCredits, splitSpend } from './allowance';
import { isCreditsEnabled } from './config';

describe('monthlyAllowanceCredits', () => {
  it("gives a paying team its plan's allowance", () => {
    expect(monthlyAllowanceCredits({ state: 'paid', tier: 'solo' })).toBe(150);
    expect(monthlyAllowanceCredits({ state: 'paid', tier: 'manager' })).toBe(660);
    expect(monthlyAllowanceCredits({ state: 'paid', tier: 'label' })).toBe(1500);
  });

  it('gives a team that is not paying the Solo amount, however big its tier reads', () => {
    // resolveTeamTier reports `label` for a trial so seat limits never bite; reading that as a plan
    // would give every three-day trial the biggest allowance.
    for (const state of ['trial', 'grace', 'comped', 'read_only', 'expired', 'unpaid']) {
      expect(monthlyAllowanceCredits({ state, tier: 'label' }), state).toBe(TRIAL_ALLOWANCE_CREDITS);
    }
    expect(TRIAL_ALLOWANCE_CREDITS).toBe(ALLOWANCE_CREDITS.solo);
  });

  it('falls back to the trial amount for anything it does not recognise', () => {
    expect(monthlyAllowanceCredits(undefined)).toBe(TRIAL_ALLOWANCE_CREDITS);
    expect(monthlyAllowanceCredits({})).toBe(TRIAL_ALLOWANCE_CREDITS);
    expect(monthlyAllowanceCredits({ state: 'paid', tier: 'enterprise' })).toBe(TRIAL_ALLOWANCE_CREDITS);
    expect(monthlyAllowanceCredits({ state: 'paid', tier: null })).toBe(TRIAL_ALLOWANCE_CREDITS);
  });

  it('rises with the plan', () => {
    expect(ALLOWANCE_CREDITS.solo).toBeLessThan(ALLOWANCE_CREDITS.manager);
    expect(ALLOWANCE_CREDITS.manager).toBeLessThan(ALLOWANCE_CREDITS.label);
  });
});

describe('splitSpend', () => {
  it('draws the allowance first, because it expires', () => {
    expect(splitSpend(10, { allowance: 100, topup: 50 })).toEqual({ fromAllowance: 10, fromTopup: 0 });
  });

  it('takes the rest from the top-up once the allowance runs out', () => {
    expect(splitSpend(30, { allowance: 20, topup: 50 })).toEqual({ fromAllowance: 20, fromTopup: 10 });
  });

  it('puts an overshoot on the top-up pool, which is where it can be seen and repaid', () => {
    expect(splitSpend(30, { allowance: 0, topup: 5 })).toEqual({ fromAllowance: 0, fromTopup: 30 });
  });

  it('never draws from a negative allowance, and never draws a negative or fractional amount', () => {
    expect(splitSpend(10, { allowance: -4, topup: 0 })).toEqual({ fromAllowance: 0, fromTopup: 10 });
    expect(splitSpend(-3, { allowance: 5, topup: 5 })).toEqual({ fromAllowance: 0, fromTopup: 0 });
    expect(splitSpend(2.9, { allowance: 5, topup: 5 })).toEqual({ fromAllowance: 2, fromTopup: 0 });
  });

  it('always adds up to what was asked', () => {
    for (const credits of [0, 1, 7, 150, 999]) {
      for (const allowance of [-10, 0, 3, 150, 5000]) {
        const { fromAllowance, fromTopup } = splitSpend(credits, { allowance, topup: 10 });
        expect(fromAllowance + fromTopup, `${credits}/${allowance}`).toBe(credits);
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
