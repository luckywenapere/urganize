import { priceFor } from './model-prices';

/**
 * Turning what the provider charged into what a team is charged, in credits.
 *
 * Pure: no IO, no env, so every rule here is testable and the numbers are the
 * founder's, agreed 2026-10-01:
 *
 *   - one credit is worth $0.01 (about 15 naira),
 *   - a turn is charged at 3x the provider's billed cost, which covers retried
 *     and failed calls, Paystack's fees and the risk of a dollar-priced cost
 *     against naira revenue,
 *   - charged from the tokens actually used, rounded UP to whole credits, with a
 *     minimum of one credit for any turn that ran.
 *
 * The provider bills in RODI. RODI_PER_USD is the rate its own dollar-listed
 * models imply (gpt-4o-mini, gpt-5.4, gpt-5.5 and luna all land within a
 * rounding error of it); the top-up that the founder made at $2 is the check on
 * it. If it is wrong the credits are mispriced by the same fraction, so it lives
 * in one place.
 */

export const RODI_PER_USD = 743;
/** What one credit is worth to the customer, in dollars. */
export const CREDIT_USD = 0.01;
/** What a charge is multiplied by over the provider's cost. */
export const MARKUP = 3;

/**
 * What a credit costs to BUY, in naira, fixed (founder, 2026-10-01): 1,500 naira
 * to the dollar, so a credit worth a cent is 15 naira. That is the price for a
 * subscriber, of any plan; an account with no subscription pays double. Recorded
 * here so the numbers exist in one place, but NOTHING sells credits yet (pack
 * sizes are undecided and there is no checkout), so no code charges these.
 */
export const NAIRA_PER_USD = 1500;
export const NAIRA_PER_CREDIT_SUBSCRIBER = NAIRA_PER_USD * CREDIT_USD;
export const NAIRA_PER_CREDIT_CREDITS_ONLY = NAIRA_PER_CREDIT_SUBSCRIBER * 2;

/** One call to the gateway, as the runner saw it. A field is null when the gateway did not say. */
export type UsageCall = {
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  /** The part of promptTokens served from the provider's cache. */
  cachedTokens: number | null;
};

/**
 * What a call is assumed to have used when the gateway reported nothing at all:
 * the chat prompt plus a short answer. Charging this is better than charging
 * nothing, and the usual cause (a provider that does not report usage) would
 * otherwise turn into free turns.
 */
export const ASSUMED_PROMPT_TOKENS = 12_000;
export const ASSUMED_COMPLETION_TOKENS = 400;

/**
 * What the gateway bills on top of the tokens, per call. Measured 2026-10-01 by
 * pricing 123 real calls from the usage log with the catalogue prices: on every
 * model the billed cost sat about 0.1 to 0.2 RODI above the token price (median
 * 0.12 to 0.19), the bill is rounded up to a tenth, and the gap is the same
 * whether the call is cheap or dear. On a quick turn (1.4 RODI) that is a tenth
 * of the cost, which is why it is here: without it the charge runs about 10% low
 * exactly where most turns are. 0.15 is the middle of that range and errs a
 * hair high, the safe side.
 */
export const PER_CALL_OVERHEAD_RODI = 0.15;

const finite = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** The provider's cost for one call, in RODI, and whether any of it was assumed. */
export function providerCostRodi(call: UsageCall): { rodi: number; assumed: boolean } {
  const price = priceFor(call.model);
  const reportedPrompt = finite(call.promptTokens);
  const reportedCompletion = finite(call.completionTokens);

  // Nothing reported at all: charge the nominal call. One half reported: the
  // missing half is assumed, so a gateway that sends only a prompt count does
  // not get its answer for free.
  const prompt = reportedPrompt ?? ASSUMED_PROMPT_TOKENS;
  const completion = reportedCompletion ?? ASSUMED_COMPLETION_TOKENS;
  const cached = Math.min(finite(call.cachedTokens) ?? 0, prompt);
  const fresh = prompt - cached;

  const rodi =
    PER_CALL_OVERHEAD_RODI +
    (fresh * price.inputPer1M + cached * price.cachedInputPer1M + completion * price.outputPer1M) / 1_000_000;
  return { rodi, assumed: price.assumed || reportedPrompt === null || reportedCompletion === null };
}

export function rodiToUsd(rodi: number): number {
  return rodi / RODI_PER_USD;
}

/**
 * Whole credits for a cost in RODI: the dollar cost, times the markup, over the
 * value of a credit, rounded UP. Rounded up because rounding down would give
 * away a fraction on every turn, and the markup already makes the customer's
 * price kind. The 1e-9 stops a cost that is exactly a whole number of credits
 * from being pushed up by floating-point dust.
 */
export function creditsForRodi(rodi: number): number {
  if (!(rodi > 0)) return 0;
  return Math.ceil((rodiToUsd(rodi) * MARKUP) / CREDIT_USD - 1e-9);
}

export type TurnCharge = {
  credits: number;
  rodi: number;
  /** True when any call's price or usage was assumed rather than reported. */
  assumed: boolean;
};

/**
 * The charge for one chat turn. The calls are summed BEFORE rounding, so a
 * three-call turn is rounded once and not three times, and a turn that ran
 * costs at least one credit (a free turn would be an invitation to script them).
 * A turn with no calls (a typed command, a refusal) costs nothing.
 */
export function turnCharge(calls: readonly UsageCall[]): TurnCharge {
  if (calls.length === 0) return { credits: 0, rodi: 0, assumed: false };
  let rodi = 0;
  let assumed = false;
  for (const call of calls) {
    const cost = providerCostRodi(call);
    rodi += cost.rodi;
    assumed = assumed || cost.assumed;
  }
  // The 1 is belt and braces: every call carries PER_CALL_OVERHEAD_RODI, so any turn
  // that ran already rounds up to a credit. It is here so that stays true if that
  // overhead is ever lowered to nothing, and no test can kill it while it is.
  return { credits: Math.max(1, creditsForRodi(rodi)), rodi, assumed };
}

/**
 * What a team must hold to START a turn on `model`: the cost of one cold call
 * (nothing cached) with a generous answer. A guard against starting a turn the
 * balance cannot pay for, not a quote. A turn that climbs to a dearer model
 * mid-way can still overshoot it, which is accepted (see credits-server.ts).
 *
 * The answer it assumes is the turn's own output cap, held between a floor and a
 * ceiling (holdOutputTokens). It used to be a flat 1,500 tokens, which is about
 * right for a short answer and well under what a long reply on the top rungs
 * costs: a streamed reply can run to a few thousand tokens before the deadline
 * (2026-10-02), so a nearly empty balance could start a turn and finish below zero.
 */
export const HOLD_PROMPT_TOKENS = 12_000;
/** The least answer a hold assumes, and what it assumes when the turn's cap is not known. */
export const HOLD_COMPLETION_TOKENS = 1_500;
/**
 * The most answer a hold assumes. About what the turn's clock lets a reply write
 * (roughly 93 tokens a second for about 50 seconds), so a cap of 8,192 does not
 * demand the price of a reply that cannot be written before the deadline.
 */
export const HOLD_COMPLETION_CEILING = 4_000;

/** The answer length a hold assumes for a turn whose output cap is `maxOutputTokens`. */
export function holdOutputTokens(maxOutputTokens?: number): number {
  if (maxOutputTokens === undefined || !Number.isFinite(maxOutputTokens)) return HOLD_COMPLETION_TOKENS;
  return Math.min(HOLD_COMPLETION_CEILING, Math.max(HOLD_COMPLETION_TOKENS, Math.floor(maxOutputTokens)));
}

export function holdCredits(model: string, completionTokens: number = HOLD_COMPLETION_TOKENS): number {
  const credits = turnCharge([
    { model, promptTokens: HOLD_PROMPT_TOKENS, completionTokens, cachedTokens: 0 },
  ]).credits;
  return credits;
}

/** Whether a balance covers the hold. Equal is enough. */
export const canStartTurn = (balance: number, hold: number): boolean => balance >= hold;
