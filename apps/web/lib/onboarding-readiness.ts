/**
 * Onboarding asks "What's already done?" ONCE (2026-10-11, founder-approved).
 *
 * Onboarding's lifecycle-stage question ("Where is this rollout in its
 * lifecycle?") and the planner's "What's already done?" asked the same thing
 * two screens apart. The planner's version is the one the product can act
 * on: its answers pre-complete the matching playbook steps
 * (`isTaskPreCompletedByReady`) and steer the tailoring. So onboarding now
 * asks the planner's question, with the planner's options and data model
 * (`ReadyItem`), hands the answer to the planner as a prefill, and the
 * planner skips its own copy (lib/planner-intake-steps.ts).
 *
 * The stage is still stored (profiles.onboarding_stage: the admin onboarding
 * tallies read it) and still drives "Your first move"
 * (lib/onboarding-ai-moment.ts), so it is DERIVED from the readiness answer
 * here rather than asked. Two stages can no longer come out of it —
 * "Actively promoting" and "Already out" — because nothing in a readiness
 * checklist says a release is already being promoted; both only ever changed
 * which single suggestion "Your first move" showed, and a planner plans a
 * rollout ahead of its date anyway.
 *
 * Pure, so vitest holds the rules.
 */

import { READY_TODAY_OPTIONS, type ReadyItem } from './ready-today';
import type { OnboardingStage } from './onboarding';

/** The planner's own options, in the planner's own order and words. */
export const ONBOARDING_READY_OPTIONS = READY_TODAY_OPTIONS;

const READY_ORDER = READY_TODAY_OPTIONS.map((option) => option.value);

export const isReadyItem = (value: unknown): value is ReadyItem =>
  typeof value === 'string' && (READY_ORDER as string[]).includes(value);

/** Valid items only, deduplicated, in option order; "none" alone when present. */
export function normalizeReadyToday(values: readonly unknown[]): ReadyItem[] {
  const set = new Set(values.filter(isReadyItem));
  if (set.has('none')) return ['none'];
  return READY_ORDER.filter((item) => set.has(item));
}

/**
 * Ticking a box. "None of it yet" is exclusive: ticking it clears the rest,
 * and ticking anything else clears it. Unticking just removes.
 */
export function toggleOnboardingReadyItem(current: readonly ReadyItem[], item: ReadyItem): ReadyItem[] {
  if (current.includes(item)) return current.filter((value) => value !== item);
  if (item === 'none') return ['none'];
  return normalizeReadyToday([...current.filter((value) => value !== 'none'), item]);
}

/**
 * The lifecycle stage a readiness answer implies:
 *  - nothing answered → null (the question is not answered yet);
 *  - "None of it yet" → just starting;
 *  - the music is not mixed and mastered yet, whatever else is → recorded
 *    (the mix and master is still the work in front of them);
 *  - mastered, and cover art plus distributor both done → date set (what is
 *    left is promo);
 *  - mastered, with assets or distribution still open → preparing.
 */
export function deriveOnboardingStage(ready: readonly ReadyItem[]): OnboardingStage | null {
  const items = normalizeReadyToday(ready);
  if (items.length === 0) return null;
  if (items[0] === 'none') return 'just_starting';
  if (!items.includes('master')) return 'recorded';
  if (items.includes('artwork') && items.includes('distributor')) return 'date_set';
  return 'preparing';
}
