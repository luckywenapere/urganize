/**
 * What the provider charges per model, in RODI per million tokens.
 *
 * Copied from RodiumAi's public catalogue (GET https://api.rodiumai.io/v1/models,
 * the `rodiumai_pricing` field) on 2026-10-01, and checked against what the
 * gateway really billed in the evaluation runs: gpt-5.4 at 10% for cached input
 * and gpt-4o-mini at 50%, which is what the usage log showed.
 *
 * WHY A TABLE IN CODE rather than reading the catalogue at request time: a
 * credits charge has to be the same number tomorrow as it is today, a pricing
 * page can be wrong for an afternoon without costing anyone money, and a charge
 * that depends on a live fetch can fail or change under a user mid-turn. The
 * price of keeping it here is that it is a copy: when RodiumAi reprices a model
 * this file is what to update (model-prices.test.ts also fails if a model on the
 * router's ladder has no price, so a new rung cannot ship unpriced).
 *
 * This is the one file outside the ladder that may name a model id (see
 * lib/ai/model-router-guard.test.ts): a price is knowledge about a specific
 * model, which is exactly what the ladder owns, and the test above is what
 * keeps the two in step.
 */

export type ModelPrice = {
  /** RODI per one million prompt tokens that were not served from cache. */
  inputPer1M: number;
  outputPer1M: number;
  /** RODI per one million prompt tokens served from the provider's cache. */
  cachedInputPer1M: number;
};

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  'openai/gpt-4o-mini': { inputPer1M: 111.7, outputPer1M: 446.7, cachedInputPer1M: 55.9 },
  'openai/gpt-5.6-luna': { inputPer1M: 148.9, outputPer1M: 893.3, cachedInputPer1M: 14.9 },
  'openai/gpt-5.4-mini': { inputPer1M: 558.3, outputPer1M: 3349.8, cachedInputPer1M: 55.9 },
  'openai/gpt-5.6-terra': { inputPer1M: 1488.8, outputPer1M: 8932.7, cachedInputPer1M: 148.9 },
  'openai/gpt-5.4': { inputPer1M: 1861.0, outputPer1M: 11165.9, cachedInputPer1M: 186.1 },
  'openai/gpt-5.5': { inputPer1M: 3722.0, outputPer1M: 22331.7, cachedInputPer1M: 372.2 },
  'openai/gpt-5.6-sol': { inputPer1M: 3722.0, outputPer1M: 22331.7, cachedInputPer1M: 372.2 },
};

/** The dearest model priced here, by output price. An unknown model is charged as this one. */
const DEAREST: ModelPrice = Object.values(MODEL_PRICES).reduce((top, price) =>
  price.outputPer1M > top.outputPer1M ? price : top
);

export type ResolvedPrice = ModelPrice & {
  /** True when the model is not in the table and the dearest price was used instead. */
  assumed: boolean;
};

/**
 * The price for a model id. An id with no price is charged at the DEAREST price
 * in the table, never at zero and never at the cheapest: the way to be wrong
 * about an unknown model that costs a user a few extra credits is better than
 * the way that gives a dear model away. `assumed` says it happened, so a caller
 * can log it and somebody can add the row.
 */
export function priceFor(model: string | null | undefined): ResolvedPrice {
  const id = String(model ?? '').trim();
  const exact = MODEL_PRICES[id] ?? MODEL_PRICES[`openai/${id}`];
  if (exact) return { ...exact, assumed: false };
  return { ...DEAREST, assumed: true };
}
