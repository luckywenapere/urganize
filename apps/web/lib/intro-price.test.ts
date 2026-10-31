import { describe, expect, it } from 'vitest';
import { getChargePrice, getIntroPrice, INTRO_MONTHS, introThenLine } from '@urganize/pricing';
import { introEndsAfterCharge, introMonthsLeft } from './intro-price';

describe('starting price months', () => {
  it('gives a team that never paid all six', () => {
    expect(introMonthsLeft({ paidBefore: false, introChargesUsed: 0 })).toBe(6);
    expect(INTRO_MONTHS).toBe(6);
  });

  it('counts down from the starting-price payments a team already made', () => {
    expect(introMonthsLeft({ paidBefore: true, introChargesUsed: 1 })).toBe(5);
    expect(introMonthsLeft({ paidBefore: true, introChargesUsed: 6 })).toBe(0);
    expect(introMonthsLeft({ paidBefore: true, introChargesUsed: 9 })).toBe(0);
  });

  it('gives none to a team that paid before at full price', () => {
    expect(introMonthsLeft({ paidBefore: true, introChargesUsed: 0 })).toBe(0);
  });

  it('switches to full price after the sixth payment, not before', () => {
    expect(introEndsAfterCharge(5)).toBe(false);
    expect(introEndsAfterCharge(6)).toBe(true);
  });
});

describe('starting price amounts', () => {
  // No tier has a starting price since 2026-10-31: Emerging ₦2,600 and Pro
  // ₦26,000 are the price from the first payment on.
  it('is the full price from the first payment, for every tier', () => {
    expect(getIntroPrice('solo')).toBeNull();
    expect(getIntroPrice('manager')).toBeNull();
    expect(getChargePrice('solo', 'monthly', 6)?.amount).toBe(2_600);
    expect(getChargePrice('manager', 'monthly', 1)?.minorUnit).toBe(2_600_000);
    expect(getChargePrice('manager', 'monthly', 0)?.amount).toBe(26_000);
  });

  it('never applies to yearly, and Label has none', () => {
    expect(getChargePrice('manager', 'annual', 6)?.amount).toBe(260_000);
    expect(getIntroPrice('label')).toBeNull();
    expect(getChargePrice('label', 'monthly', 6)?.amount).toBe(100_000);
  });

  it('says the full price that follows', () => {
    expect(introThenLine('manager')).toBeNull();
    expect(introThenLine('label')).toBeNull();
  });
});
