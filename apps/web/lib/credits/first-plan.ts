/**
 * A team's first rollout plan is free (2026-10-11, founder-approved).
 *
 * A brand-new manager finishes onboarding, lands in the planner, and used to be
 * told "This uses about 12 UrgAns credits" before they had seen anything the
 * product does. The first plan is the moment the product proves itself, so it
 * costs nothing: no hold, no charge. Every plan after it is metered exactly as
 * before (credits/embedded.ts).
 *
 * "First" is decided on the SERVER, before the run, from what the team already
 * has: no approved plan row and no rollout marked planned by UrgAns. The two
 * reads are the facts; this module is the rule, pure so it can be tested.
 *
 * FAILS TOWARD CHARGING. An unreadable count is not evidence that this is the
 * first plan, so the run is metered as usual. A wrong "free" gives away a plan;
 * a wrong "charged" costs the same 12 credits every later plan costs.
 *
 * Known and accepted: the facts hang off rollouts, so deleting every planned
 * rollout makes the next plan "first" again. A plan is about 12 credits, and
 * deleting your work to save them is not a pattern worth a new table.
 */

/** The only action the rule applies to. */
export const FIRST_PLAN_FREE_ACTION = 'release.draft_plan';

export type FirstPlanFacts = {
  /** Approved plan rows the team owner already has. null = unreadable. */
  approvedPlans: number | null;
  /** The team owner's rollouts marked planned by UrgAns. null = unreadable. */
  plannedRollouts: number | null;
};

export function isFirstPlanFree(actionId: string, facts: FirstPlanFacts): boolean {
  if (actionId !== FIRST_PLAN_FREE_ACTION) return false;
  if (facts.approvedPlans === null || facts.plannedRollouts === null) return false;
  return facts.approvedPlans === 0 && facts.plannedRollouts === 0;
}

/** What the planner's footer says instead of the cost line, when the plan is free. */
export const FIRST_PLAN_FREE_LINE = 'Your first plan is free.';
