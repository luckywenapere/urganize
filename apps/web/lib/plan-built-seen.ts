/**
 * "This manager has read the summary of the plan UrgAns built" — the dismiss
 * record behind PlanBuiltBanner.
 *
 * The banner is the ONLY place a manager learns what the build left out and
 * why (a plan for "a normal release, no marketing" removes around thirty
 * activities, each with a reason), so it shows on every visit to the rollout
 * until it is dismissed, and the dismissal has to survive a reload. It lives
 * in localStorage through lib/persisted-state.ts, as a short list of release
 * ids — the setup-prompt pattern (lib/release-setup-prompt.ts): nobody needs
 * a permanent record of every plan ever read, only enough that recent ones
 * never come back.
 *
 * Pure so vitest can hold the rules; the storage reads and writes live in
 * components/planner/usePlanBuiltSeen.ts.
 */

export const PLAN_BUILT_SEEN_STORAGE_KEY = 'urganize.workspace.plan-built-seen';
export const PLAN_BUILT_SEEN_STORAGE_VERSION = 1;
export const PLAN_BUILT_SEEN_MAX_MARKED = 50;

/** Type guard for the persisted list (readPersistedState validator). */
export function isSeenList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

export function hasSeenPlanBuilt(list: unknown, releaseId: string): boolean {
  return isSeenList(list) && list.includes(releaseId);
}

/** Append a release id, newest last, capped. Never duplicates; tolerates a
 * malformed stored value by starting fresh. */
export function markSeenPlanBuilt(list: unknown, releaseId: string): string[] {
  const base = isSeenList(list) ? list.filter((id) => id !== releaseId) : [];
  const next = [...base, releaseId];
  return next.length > PLAN_BUILT_SEEN_MAX_MARKED
    ? next.slice(next.length - PLAN_BUILT_SEEN_MAX_MARKED)
    : next;
}
