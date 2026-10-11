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
  // Cross-generation fallbacks on the ladder (2026-10-11), from the live catalogue.
  'openai/gpt-5-mini': { inputPer1M: 186.1, outputPer1M: 1489.0, cachedInputPer1M: 18.7 },
  'openai/gpt-5': { inputPer1M: 930.7, outputPer1M: 7445.0, cachedInputPer1M: 93.1 },
  'openai/gpt-5.2': { inputPer1M: 1302.9, outputPer1M: 10422.9, cachedInputPer1M: 130.3 },
  // GPT-6 (2026-10-11), exactly as the live catalogue lists them. gpt-6-astra is
  // deliberately absent: nothing routes to it (founder call: Sol, not Astra), and
  // pricing it here would make it the DEAREST row, raising what an unknown model
  // is charged by about 70% as a side effect.
  'openai/gpt-6.1-sol': { inputPer1M: 1507.1, outputPer1M: 7535.4, cachedInputPer1M: 75.4 },
  'openai/gpt-6-sol': { inputPer1M: 1507.1, outputPer1M: 7535.4, cachedInputPer1M: 150.8 },
  'openai/gpt-6-luna': { inputPer1M: 75.4, outputPer1M: 376.8, cachedInputPer1M: 7.6 },
};

/**
 * Speech models: transcription, text to speech and realtime voice, in RODI per
 * million tokens, exactly as the live catalogue listed them on 2026-10-11.
 *
 * Kept apart from MODEL_PRICES on purpose. Nothing is charged from this table:
 * dictation is free (founder call, capped per day instead) and a voice call is
 * charged a flat number of credits per started minute (lib/urgans-voice-realtime.ts),
 * so a speech model must never reach priceFor and be charged as a chat turn. It
 * is here so the cost of what those features use can be estimated and
 * reconciled against the flat rate (the weekly check the voice spec asks for).
 * The shape differs too: transcription and speech have no output or no cache
 * price, which MODEL_PRICES' own invariants (model-prices.test.ts) forbid.
 *
 * The catalogue gives one input and one output price per model. For the
 * realtime models that is the AUDIO token price as far as the catalogue says;
 * text tokens inside a voice session are cheaper upstream, so an estimate from
 * this table errs high, which is the right side to err on.
 */
export type AudioModelPrice = {
  inputPer1M: number;
  /** Zero where the model produces no billed tokens (transcription, speech). */
  outputPer1M: number;
  /** Null where the catalogue lists no cached price. */
  cachedInputPer1M: number | null;
};

export const AUDIO_MODEL_PRICES: Readonly<Record<string, AudioModelPrice>> = {
  // Speech to text. gpt-transcribe is dictation's default (lib/ai/audio-models.ts).
  'openai/gpt-transcribe': { inputPer1M: 1130.4, outputPer1M: 0, cachedInputPer1M: null },
  'openai/gpt-live-transcribe': { inputPer1M: 4272.6, outputPer1M: 0, cachedInputPer1M: null },
  // Text to speech (the voice call's cascade transport speaks with this).
  'openai/gpt-4o-mini-tts': { inputPer1M: 452.2, outputPer1M: 0, cachedInputPer1M: null },
  // Realtime voice. 2.1-mini is the default voice model; 2.1 is the premium one.
  'openai/gpt-realtime-2.1-mini': { inputPer1M: 452.2, outputPer1M: 1808.5, cachedInputPer1M: 45.3 },
  'openai/gpt-realtime-2.1': { inputPer1M: 3014.2, outputPer1M: 18084.9, cachedInputPer1M: 301.5 },
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
