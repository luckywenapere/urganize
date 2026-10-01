import { describe, expect, it } from 'vitest';

import { MIN_TOPUP_NAIRA, TOPUP_PACKS, creditsForPack, findPack } from './packs';
import { NAIRA_PER_CREDIT_CREDITS_ONLY, NAIRA_PER_CREDIT_SUBSCRIBER } from './pricing';

describe('the packs', () => {
  it('are exactly the four the founder set, at the same naira price for everyone', () => {
    expect(TOPUP_PACKS.map((p) => p.priceNaira)).toEqual([1500, 3000, 7500, 15000]);
    expect(TOPUP_PACKS.map((p) => p.subscriberCredits)).toEqual([100, 200, 500, 1000]);
    expect(TOPUP_PACKS.map((p) => p.creditsOnlyCredits)).toEqual([50, 100, 250, 500]);
    expect(MIN_TOPUP_NAIRA).toBe(1500);
  });

  it('agree with the per-credit rates: 15 naira for a subscriber and 30 for credits-only', () => {
    for (const pack of TOPUP_PACKS) {
      expect(pack.priceNaira / pack.subscriberCredits, String(pack.priceNaira)).toBe(NAIRA_PER_CREDIT_SUBSCRIBER);
      expect(pack.priceNaira / pack.creditsOnlyCredits, String(pack.priceNaira)).toBe(NAIRA_PER_CREDIT_CREDITS_ONLY);
    }
  });
});

describe('creditsForPack', () => {
  it('gives a subscriber the larger number and a credits-only account the smaller', () => {
    expect(creditsForPack('subscriber', 1500)).toBe(100);
    expect(creditsForPack('credits_only', 1500)).toBe(50);
    expect(creditsForPack('subscriber', 15000)).toBe(1000);
    expect(creditsForPack('credits_only', 15000)).toBe(500);
  });

  it('prices a trial that has not subscribed as credits-only', () => {
    expect(creditsForPack('trial', 3000)).toBe(100);
  });

  it('refuses a custom amount, which is the whole point of fixed packs', () => {
    for (const amount of [0, 1, 1499, 1501, 2000, 99999, -1500, Number.NaN, '1500', null, undefined]) {
      expect(creditsForPack('subscriber', amount), String(amount)).toBeNull();
      expect(findPack(amount), String(amount)).toBeNull();
    }
  });
});
