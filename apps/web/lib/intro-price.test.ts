import { describe, expect, it } from 'vitest';
import { getChargePrice, getIntroPrice, INTRO_MONTHS, introThenLine } from '@urganize/pricing';
import { introEndsAfterCharge, introMonthsLeft } from './intro-price';

// Emerging: ₦2,600 for the first month, then ₦4,000 (founder, 2026-11-02).
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
  it('charges Emerging ₦2,600 for the offer month, then ₦4,000', () => {
    expect(getIntroPrice('solo')?.amount).toBe(2_600);
    expect(getChargePrice('solo', 'monthly', 1)?.amount).toBe(2_600);
    expect(getChargePrice('solo', 'monthly', 0)?.amount).toBe(4_000);
  });

  it('has no offer on Pro or Label', () => {
    expect(getIntroPrice('manager')).toBeNull();
    expect(getChargePrice('manager', 'monthly', 1)?.amount).toBe(26_000);
    expect(getIntroPrice('label')).toBeNull();
    expect(getChargePrice('label', 'monthly', 1)?.amount).toBe(100_000);
  });

  it('never applies to yearly', () => {
    expect(getChargePrice('solo', 'annual', 1)?.amount).toBe(40_000);
  });

  it('says the full price that follows', () => {
    expect(introThenLine('solo')).toBe('for your first month, then ₦4,000/month');
    expect(introThenLine('manager')).toBeNull();
  });
});
