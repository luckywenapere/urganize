// A hard ceiling on what one grant search may cost.
//
// The meter is asked BEFORE every paid call and says no once the next call would pass
// the cap. Money is counted in whole millionths of a dollar, so a thousand small
// charges add up to exactly what they should and never drift.
//
// The prices below are estimates, not a published rate card. They must be checked
// against the vendor's own pricing page before a real run (Gate 0 in the plan).
// They are deliberately on the high side, so the meter errs toward stopping early.

export type SpendKind = 'search' | 'extraction';

/**
 * A search with page text, and one model read of one page, in US dollars.
 * Search CHECKED 2026-10-11 against exa.ai/pricing: auto search is $7 per 1,000
 * requests (up to 10 results) plus $1 per 1,000 pages of text, so a search with 8
 * pages of text is $0.015. Extraction is still an estimate: it depends on the model.
 */
export const DEFAULT_SPEND_PRICES_USD: Record<SpendKind, number> = {
  search: 0.015,
  extraction: 0.002,
};

const MICRO = 1_000_000;

const toMicro = (usd: number): number => Math.round(usd * MICRO);

export type SpendMeter = {
  /** The cap this meter was built with, 0 when the cap given was not usable. */
  capUsd: number;
  /** True and charged if the call fits under the cap. False and nothing charged if not. */
  tryCharge: (kind: SpendKind, usd?: number) => boolean;
  spentUsd: () => number;
  remainingUsd: () => number;
  count: (kind: SpendKind) => number;
};

export function createSpendMeter(options: { maxUsd: number; prices?: Partial<Record<SpendKind, number>> }): SpendMeter {
  const cap = typeof options.maxUsd === 'number' && Number.isFinite(options.maxUsd) && options.maxUsd > 0 ? toMicro(options.maxUsd) : 0;
  const prices: Record<SpendKind, number> = { ...DEFAULT_SPEND_PRICES_USD, ...(options.prices ?? {}) };
  const counts: Record<SpendKind, number> = { search: 0, extraction: 0 };
  let spent = 0;

  return {
    capUsd: cap / MICRO,
    tryCharge(kind, usd) {
      const known = typeof usd === 'number' && Number.isFinite(usd) && usd >= 0;
      const cost = toMicro(known ? usd : prices[kind]);
      if (spent + cost > cap) return false;
      spent += cost;
      counts[kind] += 1;
      return true;
    },
    spentUsd: () => spent / MICRO,
    remainingUsd: () => (cap - spent) / MICRO,
    count: (kind) => counts[kind],
  };
}
