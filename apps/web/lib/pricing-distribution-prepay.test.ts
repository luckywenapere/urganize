import { describe, expect, it } from 'vitest';
import {
  DISTRIBUTION_REQUIRES_PREPAY,
  PRICING_TIER_ORDER,
  PRICING_TIERS,
  distributionIncluded,
  tierFeatures,
  tierHighlights,
  tierStoresCell,
  tierStoresLine,
} from '@urganize/pricing';
import { youGet } from './self-serve';
import { readTrmFeeConfig } from './trm/partner-fee';

// Distribution comes with 6-month and yearly plans only (founder, 2026-11-13,
// #1260). A monthly Solo Plus team kept about 3,288 naira of 12,000 because we
// owe TRM its monthly plan price; TRM's yearly plan costs about a third of that
// per month. The cards must say what the app gives, on every period.

const WAITS = 'on 6-month and yearly plans';

describe('distribution needs a 6-month or yearly plan', () => {
  it('is on, and the fee config follows it when the env says nothing', () => {
    expect(DISTRIBUTION_REQUIRES_PREPAY).toBe(true);
    expect(readTrmFeeConfig({}).distributionRequiresPrepay).toBe(true);
  });

  it('lets the env turn it off or on', () => {
    expect(readTrmFeeConfig({ DISTRIBUTION_REQUIRES_PREPAY: 'false' }).distributionRequiresPrepay).toBe(false);
    expect(readTrmFeeConfig({ DISTRIBUTION_REQUIRES_PREPAY: ' TRUE ' }).distributionRequiresPrepay).toBe(true);
    // Anything unreadable keeps the rule rather than quietly dropping it.
    expect(readTrmFeeConfig({ DISTRIBUTION_REQUIRES_PREPAY: 'maybe' }).distributionRequiresPrepay).toBe(true);
  });

  it('says so on the monthly card of every plan that includes distribution', () => {
    expect(tierStoresLine('solo_plus', 'NGN', 'monthly')).toBe(`Singles and EPs to stores ${WAITS}`);
    expect(tierStoresLine('pro', 'NGN', 'monthly')).toBe(`Singles and EPs to stores for 1 artist ${WAITS}`);
    expect(tierStoresLine('label', 'NGN', 'monthly')).toBe(`Singles, EPs and albums for 5 artists ${WAITS}`);
  });

  it('keeps "included" on the yearly and 6-month cards', () => {
    for (const interval of ['annual', 'semiannual'] as const) {
      expect(tierStoresLine('solo_plus', 'NGN', interval)).toBe('Singles and EPs to stores, included');
      expect(tierStoresLine('pro', 'NGN', interval)).toBe('Singles and EPs to stores for 1 artist, included');
      expect(tierStoresLine('label', 'NGN', interval)).toBe('Singles, EPs and albums for 5 artists, included');
    }
  });

  it('opens on the monthly wording, because cards open on monthly', () => {
    expect(tierStoresLine('solo_plus')).toBe(tierStoresLine('solo_plus', 'NGN', 'monthly'));
    expect(tierFeatures('solo_plus').lines).toContain(`Singles and EPs to stores ${WAITS}`);
    expect(tierFeatures('solo_plus', 'NGN', 'annual').lines).toContain('Singles and EPs to stores, included');
  });

  it('never tells a monthly card "included" unless the app would give it', () => {
    for (const id of PRICING_TIER_ORDER) {
      const line = tierStoresLine(id, 'NGN', 'monthly');
      const given = distributionIncluded(id, 'monthly', DISTRIBUTION_REQUIRES_PREPAY);
      if (PRICING_TIERS[id].includesDistribution && !given) {
        expect(line, id).not.toMatch(/included/);
        expect(line, id).toContain(WAITS);
      }
    }
  });

  it('leaves plans without distribution alone', () => {
    expect(tierStoresLine('solo', 'NGN', 'monthly')).toBe(tierStoresLine('solo', 'NGN', 'annual'));
    expect(tierStoresLine('manager', 'NGN', 'monthly')).toBe(tierStoresLine('manager', 'NGN', 'annual'));
    expect(tierStoresLine('solo', 'NGN', 'monthly')).toMatch(/^Send singles to stores for /);
  });

  it('states the rule in the compare table, which has no period', () => {
    expect(tierStoresCell('solo_plus')).toBe(`Singles and EPs ${WAITS}`);
    expect(tierStoresCell('pro')).toBe(`Singles and EPs, 1 artist, ${WAITS}`);
    expect(tierStoresCell('label')).toBe(`Singles, EPs, albums, 5 artists, ${WAITS}`);
    expect(tierStoresCell('solo')).toMatch(/a single$/);
  });

  it('uses the rule in the highlight list by default', () => {
    expect(tierHighlights('pro', { interval: 'monthly' })).toContain('Distribution on 6-month and yearly plans');
    expect(tierHighlights('pro', { interval: 'annual' }).join(' ')).not.toContain('Distribution on 6-month');
  });

  it('tells checkout the same thing for the period being paid', () => {
    expect(youGet('solo_plus', true, 'monthly').at(-1)).toEqual({ label: 'Distribution', value: '6-month and yearly plans' });
    expect(youGet('solo_plus', true, 'annual').at(-1)).toEqual({ label: 'Distribution', value: 'Partner' });
    // No period in hand: the row names the partner, as before.
    expect(youGet('pro', true).at(-1)).toEqual({ label: 'Distribution', value: 'Partner' });
    expect(youGet('solo', true, 'monthly').some((row) => row.label === 'Distribution')).toBe(false);
  });
});
