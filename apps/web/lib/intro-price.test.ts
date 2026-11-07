import { describe, expect, it } from 'vitest';
import { getChargePrice, getIntroPrice, INTRO_MONTHS, introThenLine } from '@urganize/pricing';
import { introEndsAfterCharge, introMonthsLeft } from './intro-price';

// The first-month price machinery (2026-11-02). No plan uses it since 2026-11-07.
describe('starting price months', () => {
  it('gives a team that never paid one offer month', () => {
    expect(INTRO_MONTHS).toBe(1);
    expect(introMonthsLeft({ paidBefore: false, introChargesUsed: 0 })).toBe(1);
  });

  it('gives none once the offer month is used, even across a gap', () => {
    expect(introMonthsLeft({ paidBefore: true, introChargesUsed: 1 })).toBe(0);
    expect(introMonthsLeft({ paidBefore: true, introChargesUsed: 6 })).toBe(0);
  });

  it('gives none to a team that paid before at full price', () => {
    expect(introMonthsLeft({ paidBefore: true, introChargesUsed: 0 })).toBe(0);
  });

  it('switches to full price after the first payment', () => {
    expect(introEndsAfterCharge(0)).toBe(false);
    expect(introEndsAfterCharge(1)).toBe(true);
  });
});

describe('starting price amounts', () => {
  // No plan has a first-month price since 2026-11-07 (#1112): the machinery
  // stays so a future offer is one field, and every plan charges full price.
  it('has no first-month price on any plan', () => {
    for (const tier of ['solo', 'manager', 'pro', 'label'] as const) {
      expect(getIntroPrice(tier), tier).toBeNull();
      expect(introThenLine(tier), tier).toBeNull();
    }
  });

  it('charges the full monthly price even with offer months left', () => {
    expect(getChargePrice('solo', 'monthly', 1)?.amount).toBe(5_000);
    expect(getChargePrice('manager', 'monthly', 1)?.amount).toBe(15_000);
    expect(getChargePrice('pro', 'monthly', 1)?.amount).toBe(40_000);
    expect(getChargePrice('label', 'monthly', 1)?.amount).toBe(100_000);
  });

  it('charges ten months for a year', () => {
    expect(getChargePrice('solo', 'annual', 1)?.amount).toBe(50_000);
    expect(getChargePrice('pro', 'annual', 1)?.amount).toBe(400_000);
  });
});
