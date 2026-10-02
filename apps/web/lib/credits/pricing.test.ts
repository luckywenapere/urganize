import { describe, expect, it } from 'vitest';

import {
  ASSUMED_COMPLETION_TOKENS,
  ASSUMED_PROMPT_TOKENS,
  CREDIT_USD,
  MARKUP,
  PER_CALL_OVERHEAD_RODI,
  RODI_PER_USD,
  canStartTurn,
  creditsForRodi,
  HOLD_COMPLETION_CEILING,
  HOLD_COMPLETION_TOKENS,
  holdCredits,
  holdOutputTokens,
  providerCostRodi,
  rodiToUsd,
  turnCharge,
  type UsageCall,
} from './pricing';

const call = (over: Partial<UsageCall> = {}): UsageCall => ({
  model: 'openai/gpt-4o-mini',
  promptTokens: 10_000,
  completionTokens: 100,
  cachedTokens: 0,
  ...over,
});

describe("the founder's numbers", () => {
  it('are a credit of one cent at three times cost, 743 RODI to the dollar', () => {
    expect(CREDIT_USD).toBe(0.01);
    expect(MARKUP).toBe(3);
    expect(RODI_PER_USD).toBe(743);
  });
});

describe('providerCostRodi', () => {
  it('prices fresh prompt tokens, answer tokens and the per-call overhead', () => {
    // 10,000 x 111.7 + 100 x 446.7 per million = 1.117 + 0.04467, plus the overhead.
    const { rodi, assumed } = providerCostRodi(call());
    expect(rodi).toBeCloseTo(1.16167 + PER_CALL_OVERHEAD_RODI, 5);
    expect(assumed).toBe(false);
  });

  it('prices the cached part of the prompt at the cached rate', () => {
    const cold = providerCostRodi(call({ model: 'openai/gpt-5.4', cachedTokens: 0 })).rodi;
    const warm = providerCostRodi(call({ model: 'openai/gpt-5.4', cachedTokens: 10_000 })).rodi;
    expect(warm).toBeLessThan(cold / 4);
    // 10,000 cached x 186.1 + 100 out x 11165.9 per million, plus overhead.
    expect(warm).toBeCloseTo((10_000 * 186.1 + 100 * 11165.9) / 1e6 + PER_CALL_OVERHEAD_RODI, 5);
  });

  it('never counts more cached tokens than there were prompt tokens', () => {
    const over = providerCostRodi(call({ cachedTokens: 99_999 })).rodi;
    const exact = providerCostRodi(call({ cachedTokens: 10_000 })).rodi;
    expect(over).toBeCloseTo(exact, 9);
  });

  it('treats missing or nonsense cached counts as nothing cached, the dearer way', () => {
    const base = providerCostRodi(call({ cachedTokens: 0 })).rodi;
    for (const cachedTokens of [null, Number.NaN, -5]) {
      expect(providerCostRodi(call({ cachedTokens })).rodi, String(cachedTokens)).toBeCloseTo(base, 9);
    }
  });

  it('charges the nominal call when the gateway reported nothing, and says so', () => {
    const { rodi, assumed } = providerCostRodi(call({ promptTokens: null, completionTokens: null }));
    expect(assumed).toBe(true);
    const nominal = providerCostRodi(
      call({ promptTokens: ASSUMED_PROMPT_TOKENS, completionTokens: ASSUMED_COMPLETION_TOKENS })
    ).rodi;
    expect(rodi).toBeCloseTo(nominal, 9);
    expect(rodi).toBeGreaterThan(PER_CALL_OVERHEAD_RODI);
  });

  it('assumes the missing half when only one half was reported', () => {
    const noAnswer = providerCostRodi(call({ completionTokens: null }));
    expect(noAnswer.assumed).toBe(true);
    expect(noAnswer.rodi).toBeGreaterThan(providerCostRodi(call({ completionTokens: 0 })).rodi);
  });

  it('charges an unpriced model as the dearest, and flags it', () => {
    const unknown = providerCostRodi(call({ model: 'x/unknown' }));
    expect(unknown.assumed).toBe(true);
    expect(unknown.rodi).toBeGreaterThan(providerCostRodi(call({ model: 'openai/gpt-5.5' })).rodi - 1e-9);
  });
});

describe('creditsForRodi', () => {
  const oneCreditRodi = (RODI_PER_USD * CREDIT_USD) / MARKUP;

  it('is zero for nothing and for nonsense', () => {
    for (const rodi of [0, -1, Number.NaN]) expect(creditsForRodi(rodi), String(rodi)).toBe(0);
  });

  it('rounds UP, so a fraction of a credit is a credit', () => {
    expect(creditsForRodi(oneCreditRodi * 0.01)).toBe(1);
    expect(creditsForRodi(oneCreditRodi * 1.01)).toBe(2);
    expect(creditsForRodi(oneCreditRodi * 2.5)).toBe(3);
  });

  it('does not push an exact whole credit up to the next', () => {
    expect(creditsForRodi(oneCreditRodi)).toBe(1);
    expect(creditsForRodi(oneCreditRodi * 3)).toBe(3);
    expect(creditsForRodi(oneCreditRodi * 10)).toBe(10);
  });

  it('is the dollar cost times the markup over the value of a credit', () => {
    expect(creditsForRodi(RODI_PER_USD)).toBe(Math.ceil((1 * MARKUP) / CREDIT_USD)); // $1 of cost = 300 credits
    expect(rodiToUsd(RODI_PER_USD)).toBe(1);
  });
});

describe('turnCharge', () => {
  it('costs nothing when no call was made', () => {
    expect(turnCharge([])).toEqual({ credits: 0, rodi: 0, assumed: false });
  });

  it('costs at least one credit for any turn that ran', () => {
    expect(turnCharge([call({ promptTokens: 1, completionTokens: 1 })]).credits).toBe(1);
  });

  it('sums the calls BEFORE rounding, so a turn is rounded once, not once per call', () => {
    // Each call is a bit over a third of a credit; three of them are about a credit, not three.
    const tiny = call({ promptTokens: 100, completionTokens: 10, cachedTokens: 0 });
    const one = providerCostRodi(tiny).rodi;
    expect(creditsForRodi(one)).toBe(1);
    const three = turnCharge([tiny, tiny, tiny]);
    expect(three.rodi).toBeCloseTo(one * 3, 9);
    expect(three.credits).toBe(creditsForRodi(one * 3));
    expect(three.credits).toBeLessThan(3);
  });

  it('flags a turn with any assumed call', () => {
    expect(turnCharge([call(), call({ promptTokens: null })]).assumed).toBe(true);
    expect(turnCharge([call(), call()]).assumed).toBe(false);
  });
});

describe('what real turns cost in credits (the figures behind the pricing)', () => {
  const turn = (model: string, cold: boolean, rounds: number): number => {
    const calls: UsageCall[] = [];
    for (let i = 0; i < rounds; i += 1) {
      calls.push({
        model,
        promptTokens: 10_800 + 600 * i,
        completionTokens: i === rounds - 1 ? 350 : 80,
        cachedTokens: cold && i === 0 ? 0 : 10_800,
      });
    }
    return turnCharge(calls).credits;
  };

  it('a typical quick turn is a credit or two', () => {
    expect(turn('openai/gpt-4o-mini', true, 2)).toBeLessThanOrEqual(2);
    expect(turn('openai/gpt-4o-mini', false, 2)).toBeLessThanOrEqual(2);
  });

  it('gets dearer with each rung, and a cold turn costs more than a warm one on a reasoning model', () => {
    const quick = turn('openai/gpt-4o-mini', true, 2);
    const standard = turn('openai/gpt-5.4-mini', true, 2);
    const pro = turn('openai/gpt-5.4', true, 2);
    const max = turn('openai/gpt-5.5', true, 2);
    expect(quick).toBeLessThanOrEqual(standard);
    expect(standard).toBeLessThan(pro);
    expect(pro).toBeLessThan(max);
    expect(turn('openai/gpt-5.4', true, 2)).toBeGreaterThan(turn('openai/gpt-5.4', false, 2));
  });

  it('a cold max turn is the one worth warning about: tens of credits', () => {
    expect(turn('openai/gpt-5.5', true, 2)).toBeGreaterThan(15);
  });
});

describe('the hold', () => {
  it('is one credit on the quick model and rises with the model', () => {
    expect(holdCredits('openai/gpt-4o-mini')).toBe(1);
    expect(holdCredits('openai/gpt-5.4-mini')).toBeLessThan(holdCredits('openai/gpt-5.4'));
    expect(holdCredits('openai/gpt-5.4')).toBeLessThan(holdCredits('openai/gpt-5.5'));
  });

  it('assumes the answer the turn may write, between a floor and a ceiling', () => {
    expect(holdOutputTokens(undefined)).toBe(HOLD_COMPLETION_TOKENS);
    expect(holdOutputTokens(Number.NaN)).toBe(HOLD_COMPLETION_TOKENS);
    // A cap below the floor does not lower the hold: it is a guard, and 1,500 was always the least.
    expect(holdOutputTokens(1_024)).toBe(HOLD_COMPLETION_TOKENS);
    expect(holdOutputTokens(3_000)).toBe(3_000);
    // A cap no reply can reach before the deadline does not demand its price.
    expect(holdOutputTokens(8_192)).toBe(HOLD_COMPLETION_CEILING);
    expect(HOLD_COMPLETION_CEILING).toBeGreaterThan(HOLD_COMPLETION_TOKENS);
  });

  it('is unchanged when no answer length is given, so a turn the router did not touch holds what it did', () => {
    expect(holdCredits('openai/gpt-5.5')).toBe(holdCredits('openai/gpt-5.5', HOLD_COMPLETION_TOKENS));
  });

  it('holds more for a longer answer on a dear model, and stays cheap on the quick one', () => {
    expect(holdCredits('openai/gpt-5.5', HOLD_COMPLETION_CEILING)).toBeGreaterThan(holdCredits('openai/gpt-5.5'));
    expect(holdCredits('openai/gpt-5.4', HOLD_COMPLETION_CEILING)).toBeGreaterThan(holdCredits('openai/gpt-5.4'));
    // Rounded up to whole credits, so the quick model's longest hold is still only a couple.
    expect(holdCredits('openai/gpt-4o-mini', HOLD_COMPLETION_CEILING)).toBeLessThanOrEqual(2);
  });

  it('an unknown model is held as the dearest', () => {
    expect(holdCredits('x/unknown')).toBeGreaterThanOrEqual(holdCredits('openai/gpt-5.5'));
  });

  it('lets a team start on exactly the hold, and not on one credit less', () => {
    const hold = holdCredits('openai/gpt-5.4');
    expect(canStartTurn(hold, hold)).toBe(true);
    expect(canStartTurn(hold - 1, hold)).toBe(false);
    expect(canStartTurn(0, 1)).toBe(false);
    expect(canStartTurn(-5, 1)).toBe(false);
  });
});
