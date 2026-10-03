import { turnCharge, type FailedCall, type TurnCharge, type UsageCall } from './pricing';

/**
 * How the embedded actions (the rollout planner, a press-kit draft) are paid for.
 *
 * THE RULES (founder, 2026-10-01, round 2): metered, with no flat price. A run is
 * billed on the tokens it really used, at the same 3x the provider's cost as chat.
 * Before it starts the person sees an ESTIMATE and a HOLD of up to 25 credits is
 * placed; afterwards it settles at the real cost, never above the hold, and the
 * rest of the hold is released. A failed run costs nothing.
 *
 * The hold is a CHECK, not a reserved row: a run starts only if the balance
 * covers the hold, and it is charged only when it succeeds, so there is nothing
 * to release when it is smaller or fails. That is the same accepted limit chat
 * has (see credits-server.ts): runs started in parallel all see one balance, so
 * a team can overshoot by the runs already in flight.
 *
 * Flat prices were the earlier plan ("once measured"). Every run stores its
 * model, input tokens, cached tokens and output tokens (embeddedUsageSummary) so
 * that decision can be made later from real runs rather than guessed.
 *
 * Pure: no IO, no env.
 */

/** The most one embedded run can ever cost, and what must be in the balance to start one. */
export const EMBEDDED_HOLD_CREDITS = 25;

/**
 * What a person is told a run will cost before they start it. Only the planner
 * has been estimated (about 12 credits); anything without its own estimate, which
 * today is the press-kit draft, is shown the hold, because that is the most it
 * can cost and the honest number to give.
 */
export const EMBEDDED_ESTIMATE_CREDITS: Readonly<Record<string, number>> = {
  'release.draft_plan': 12,
};

export function embeddedEstimateCredits(actionId: string): number {
  const estimate = EMBEDDED_ESTIMATE_CREDITS[actionId];
  return typeof estimate === 'number' ? Math.min(estimate, EMBEDDED_HOLD_CREDITS) : EMBEDDED_HOLD_CREDITS;
}

export type EmbeddedCharge = TurnCharge & {
  /** What the run really cost before the cap. Equal to `credits` unless capped. */
  uncappedCredits: number;
  /** True when the run cost more than the hold and was charged the hold. */
  capped: boolean;
};

/**
 * What a successful run is charged: the token cost like any turn, then never more
 * than the hold. A run that made no model call (no model configured, so the plan
 * is the untailored playbook) is charged nothing.
 */
export function embeddedCharge(calls: readonly UsageCall[]): EmbeddedCharge {
  const charge = turnCharge(calls);
  const credits = Math.min(charge.credits, EMBEDDED_HOLD_CREDITS);
  return { ...charge, credits, uncappedCredits: charge.credits, capped: charge.credits > EMBEDDED_HOLD_CREDITS };
}

/** What a usage report from the provider layer looks like, structurally. */
export type ReportedUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  cachedTokens?: number | null;
  model?: string | null;
};

/**
 * Gathers every model call a run makes. ALL of them, retries and hops included:
 * the provider billed each one, and a run that succeeded after a slow first
 * attempt really cost both. (A run that fails is not charged at all, so the
 * calls of a failed run are simply never settled.) `fallbackModel` names the
 * model for a call whose report did not say, the dearer way when unknown.
 */
export function createUsageCollector(fallbackModel: string | null) {
  const calls: UsageCall[] = [];
  // Attempts that returned no answer. Kept apart from `calls` on purpose: only a
  // call that reported usage is ever charged, and a failure must never change
  // what a run costs a team. They exist so the usage log can still show them.
  const failures: FailedCall[] = [];
  return {
    calls,
    failures,
    onFailure(failure: FailedCall): void {
      failures.push({ model: failure.model ?? fallbackModel ?? null, kind: failure.kind });
    },
    onUsage(reported: ReportedUsage): void {
      calls.push({
        model: reported.model || fallbackModel || 'unknown',
        promptTokens: reported.promptTokens,
        completionTokens: reported.completionTokens,
        cachedTokens: reported.cachedTokens ?? null,
      });
    },
  };
}

/**
 * A column total over a run's calls, or null when the gateway reported none of
 * them: "not reported" is not the same as a free run, and the nullable columns
 * on urgans_actions exist for exactly that.
 */
export function sumTokens(values: ReadonlyArray<number | null>): number | null {
  const reported = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return reported.length === 0 ? null : reported.reduce((total, value) => total + value, 0);
}

const MAX_LOGGED_CALLS = 12;

/**
 * What is stored on every run: the model, input tokens, cached tokens and output
 * tokens of each call, and what was charged. Bounded, because a run with many
 * retries must not write an unbounded row.
 */
export function embeddedUsageSummary(calls: readonly UsageCall[], charge: EmbeddedCharge): Record<string, unknown> {
  return {
    calls: calls.slice(0, MAX_LOGGED_CALLS).map((call) => ({
      model: call.model,
      tokens_in: call.promptTokens,
      tokens_cached: call.cachedTokens,
      tokens_out: call.completionTokens,
    })),
    callCount: calls.length,
    credits: charge.credits,
    uncappedCredits: charge.uncappedCredits,
    capped: charge.capped,
    rodi: Math.round(charge.rodi * 1000) / 1000,
    assumed: charge.assumed,
  };
}
