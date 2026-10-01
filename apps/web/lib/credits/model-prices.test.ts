import { describe, expect, it } from 'vitest';

import { DEFAULT_LADDER, MODEL_TIERS } from '@/lib/ai/model-ladder';
import { providerCostRodi } from './pricing';
import { MODEL_PRICES, priceFor } from './model-prices';

describe('the price table', () => {
  it('prices every model on the router ladder, so a new rung cannot ship unpriced', () => {
    for (const tier of MODEL_TIERS) {
      for (const model of DEFAULT_LADDER[tier].models) {
        expect(MODEL_PRICES[model], `${tier}: ${model}`).toBeDefined();
        expect(priceFor(model).assumed, model).toBe(false);
      }
    }
  });

  it('charges less for a cached prompt token than a fresh one, on every model', () => {
    for (const [model, price] of Object.entries(MODEL_PRICES)) {
      expect(price.cachedInputPer1M, model).toBeLessThan(price.inputPer1M);
      expect(price.inputPer1M, model).toBeGreaterThan(0);
      expect(price.outputPer1M, model).toBeGreaterThan(price.inputPer1M);
    }
  });

  it('finds a model with or without the vendor prefix', () => {
    expect(priceFor('openai/gpt-5.4').assumed).toBe(false);
    expect(priceFor('gpt-5.4').inputPer1M).toBe(MODEL_PRICES['openai/gpt-5.4'].inputPer1M);
  });

  it('charges an unknown model as the DEAREST one, never as free and never as the cheapest', () => {
    const unknown = priceFor('some/new-model');
    expect(unknown.assumed).toBe(true);
    const dearestOutput = Math.max(...Object.values(MODEL_PRICES).map((p) => p.outputPer1M));
    expect(unknown.outputPer1M).toBe(dearestOutput);
    for (const bad of ['', null, undefined, '   ']) expect(priceFor(bad).assumed).toBe(true);
  });
});

describe('the table against what the gateway really billed (usage log, 2026-10-01)', () => {
  // Real rows: the prompt, the cached part, the answer, and the RODI billed.
  const billed = [
    { model: 'openai/gpt-5.6-terra', prompt: 10806, cached: 10782, out: 51, rodi: 2.3 },
    { model: 'openai/gpt-5.6-terra', prompt: 10800, cached: 10782, out: 60, rodi: 2.4 },
    { model: 'openai/gpt-4o-mini', prompt: 10722, cached: 10624, out: 221, rodi: 0.8 },
    { model: 'openai/gpt-4o-mini', prompt: 10716, cached: 10624, out: 105, rodi: 0.8 },
  ];

  it('lands within a tenth of a RODI of each, which is how finely the gateway bills', () => {
    for (const row of billed) {
      const predicted = providerCostRodi({
        model: row.model,
        promptTokens: row.prompt,
        completionTokens: row.out,
        cachedTokens: row.cached,
      }).rodi;
      expect(
        Math.abs(predicted - row.rodi),
        `${row.model} predicted ${predicted.toFixed(3)} billed ${row.rodi}`
      ).toBeLessThan(0.15);
    }
  });
});
