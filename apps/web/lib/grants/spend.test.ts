import { describe, expect, it } from 'vitest';
import { createSpendMeter, DEFAULT_SPEND_PRICES_USD } from './spend';

describe('prices', () => {
  it('are positive numbers, so a run can never read as free', () => {
    expect(DEFAULT_SPEND_PRICES_USD.search).toBeGreaterThan(0);
    expect(DEFAULT_SPEND_PRICES_USD.extraction).toBeGreaterThan(0);
  });
});

describe('createSpendMeter', () => {
  it('starts at zero with the whole cap left', () => {
    const meter = createSpendMeter({ maxUsd: 1 });
    expect(meter.spentUsd()).toBe(0);
    expect(meter.remainingUsd()).toBe(1);
    expect(meter.count('search')).toBe(0);
  });

  it('charges a search at its price and counts it', () => {
    const meter = createSpendMeter({ maxUsd: 1, prices: { search: 0.25 } });
    expect(meter.tryCharge('search')).toBe(true);
    expect(meter.spentUsd()).toBe(0.25);
    expect(meter.remainingUsd()).toBe(0.75);
    expect(meter.count('search')).toBe(1);
    expect(meter.count('extraction')).toBe(0);
  });

  it('allows a charge that lands exactly on the cap', () => {
    const meter = createSpendMeter({ maxUsd: 0.5, prices: { search: 0.25 } });
    expect(meter.tryCharge('search')).toBe(true);
    expect(meter.tryCharge('search')).toBe(true);
    expect(meter.spentUsd()).toBe(0.5);
    expect(meter.remainingUsd()).toBe(0);
  });

  it('refuses a charge that would pass the cap and spends nothing on the refusal', () => {
    const meter = createSpendMeter({ maxUsd: 0.5, prices: { search: 0.25 } });
    meter.tryCharge('search');
    meter.tryCharge('search');
    expect(meter.tryCharge('search')).toBe(false);
    expect(meter.spentUsd()).toBe(0.5);
    expect(meter.count('search')).toBe(2);
  });

  it('refuses a big charge but still allows a smaller one that fits', () => {
    const meter = createSpendMeter({ maxUsd: 0.3, prices: { search: 0.25, extraction: 0.01 } });
    meter.tryCharge('search');
    expect(meter.tryCharge('search')).toBe(false);
    expect(meter.tryCharge('extraction')).toBe(true);
  });

  it('takes the real cost of a call when it is known', () => {
    const meter = createSpendMeter({ maxUsd: 1, prices: { extraction: 0.5 } });
    expect(meter.tryCharge('extraction', 0.02)).toBe(true);
    expect(meter.spentUsd()).toBe(0.02);
  });

  it('falls back to the price when a cost is not a usable number', () => {
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      const meter = createSpendMeter({ maxUsd: 1, prices: { extraction: 0.1 } });
      meter.tryCharge('extraction', bad);
      expect(meter.spentUsd()).toBe(0.1);
    }
  });

  it('does not drift over many small charges', () => {
    const meter = createSpendMeter({ maxUsd: 7, prices: { search: 0.007 } });
    for (let i = 0; i < 1000; i += 1) expect(meter.tryCharge('search')).toBe(true);
    expect(meter.spentUsd()).toBe(7);
    expect(meter.tryCharge('search')).toBe(false);
  });

  it('refuses everything when the cap is not a usable number', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, undefined as unknown as number]) {
      const meter = createSpendMeter({ maxUsd: bad });
      expect(meter.capUsd).toBe(0);
      expect(meter.tryCharge('search')).toBe(false);
      expect(meter.spentUsd()).toBe(0);
    }
  });
});
