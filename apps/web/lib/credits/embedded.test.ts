import { describe, expect, it } from 'vitest';

import {
  EMBEDDED_ESTIMATE_CREDITS,
  EMBEDDED_HOLD_CREDITS,
  createUsageCollector,
  embeddedCharge,
  embeddedEstimateCredits,
  embeddedUsageSummary,
  sumTokens,
} from './embedded';
import { turnCharge, type UsageCall } from './pricing';

const call = (over: Partial<UsageCall> = {}): UsageCall => ({
  model: 'openai/gpt-5.4',
  promptTokens: 4000,
  completionTokens: 1500,
  cachedTokens: 0,
  ...over,
});

describe("the founder's rules", () => {
  it('hold up to 25 credits and expect about 12 for the planner', () => {
    expect(EMBEDDED_HOLD_CREDITS).toBe(25);
    expect(EMBEDDED_ESTIMATE_CREDITS['release.draft_plan']).toBe(12);
  });

  it('show the press-kit draft the hold as its estimate, until it has one of its own', () => {
    expect(embeddedEstimateCredits('presskit.draft_section')).toBe(25);
    expect(embeddedEstimateCredits('release.draft_plan')).toBe(12);
    expect(embeddedEstimateCredits('something.new')).toBe(25);
  });
});

describe('embeddedCharge', () => {
  it('is the real token cost at three times the provider, the same as chat', () => {
    const calls = [call()];
    const charge = embeddedCharge(calls);
    expect(charge.credits).toBe(turnCharge(calls).credits);
    expect(charge.capped).toBe(false);
    expect(charge.uncappedCredits).toBe(charge.credits);
  });

  it('adds up every call before rounding, retries included', () => {
    const one = embeddedCharge([call()]);
    const two = embeddedCharge([call(), call()]);
    expect(two.rodi).toBeCloseTo(one.rodi * 2, 6);
    expect(two.credits).toBeGreaterThan(one.credits);
  });

  it('never charges more than the hold, and says it was capped and by how much it would have been', () => {
    const huge = [call({ model: 'openai/gpt-5.5', promptTokens: 100_000, completionTokens: 40_000 })];
    const charge = embeddedCharge(huge);
    expect(turnCharge(huge).credits).toBeGreaterThan(25);
    expect(charge.credits).toBe(25);
    expect(charge.capped).toBe(true);
    expect(charge.uncappedCredits).toBe(turnCharge(huge).credits);
  });

  it('charges exactly the hold, uncapped, at the boundary', () => {
    // Find a size that costs exactly 25: scan, so the test does not depend on a price.
    let n = 1000;
    while (turnCharge([call({ completionTokens: n })]).credits < 25) n += 25;
    const charge = embeddedCharge([call({ completionTokens: n })]);
    expect(charge.credits).toBeLessThanOrEqual(25);
    expect(charge.uncappedCredits).toBeGreaterThanOrEqual(25);
  });

  it('costs nothing when no model call was made, such as the untailored playbook', () => {
    expect(embeddedCharge([])).toMatchObject({ credits: 0, uncappedCredits: 0, capped: false });
  });

  it('costs at least a credit for any run that did call a model', () => {
    expect(embeddedCharge([call({ promptTokens: 1, completionTokens: 1, model: 'openai/gpt-4o-mini' })]).credits).toBe(1);
  });
});

describe('createUsageCollector', () => {
  it('keeps every call, in order, with the model and cached tokens the provider reported', () => {
    const collector = createUsageCollector('openai/gpt-5.4');
    collector.onUsage({ promptTokens: 100, completionTokens: 10, cachedTokens: 40, model: 'openai/gpt-5.6-terra' });
    collector.onUsage({ promptTokens: 200, completionTokens: 20 });
    expect(collector.calls).toEqual([
      { model: 'openai/gpt-5.6-terra', promptTokens: 100, completionTokens: 10, cachedTokens: 40 },
      { model: 'openai/gpt-5.4', promptTokens: 200, completionTokens: 20, cachedTokens: null },
    ]);
  });

  it('names an unknown model rather than dropping the call, so it is priced as the dearest', () => {
    const collector = createUsageCollector(null);
    collector.onUsage({ promptTokens: 1, completionTokens: 1 });
    expect(collector.calls[0].model).toBe('unknown');
    expect(embeddedCharge(collector.calls).assumed).toBe(true);
  });
});

describe('sumTokens', () => {
  it('adds the reported values', () => {
    expect(sumTokens([100, 20, 3])).toBe(123);
  });

  it('skips what was not reported, and is null when nothing was, which is not a free run', () => {
    expect(sumTokens([100, null, 20])).toBe(120);
    expect(sumTokens([null, null])).toBeNull();
    expect(sumTokens([])).toBeNull();
  });
});

describe('embeddedUsageSummary', () => {
  it('stores the model, input, cached and output tokens of every call, and what was charged', () => {
    const calls = [call({ cachedTokens: 5000 }), call({ model: 'openai/gpt-5.6-terra', promptTokens: 7000 })];
    const summary = embeddedUsageSummary(calls, embeddedCharge(calls)) as Record<string, unknown>;
    expect(summary.calls).toEqual([
      { model: 'openai/gpt-5.4', tokens_in: 4000, tokens_cached: 5000, tokens_out: 1500 },
      { model: 'openai/gpt-5.6-terra', tokens_in: 7000, tokens_cached: 0, tokens_out: 1500 },
    ]);
    expect(summary).toMatchObject({ callCount: 2, capped: false, assumed: false });
    expect(typeof summary.credits).toBe('number');
    expect(typeof summary.rodi).toBe('number');
  });

  it('is bounded, so a run with many retries cannot write an unbounded row', () => {
    const calls = Array.from({ length: 40 }, () => call());
    const summary = embeddedUsageSummary(calls, embeddedCharge(calls)) as { calls: unknown[]; callCount: number };
    expect(summary.calls).toHaveLength(12);
    expect(summary.callCount).toBe(40);
  });
});
