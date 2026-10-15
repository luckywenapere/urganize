/**
 * Release phases, derived from a task's offset to release day.
 *
 * Split out of release-planning.ts (2026-10-15, perf pass URG-314): that
 * module is ~2,800 lines of planner parsing and validation, and the small
 * helpers that only need phases (next-moves, rollout-phases) pulled all of it
 * into the root layout's JavaScript. release-planning.ts re-exports
 * everything here, so existing importers are unchanged.
 */

export type PlanPhase = 'setup' | 'pre_release' | 'release_week' | 'post_release';

export const PLAN_PHASE_ORDER: PlanPhase[] = [
  'setup',
  'pre_release',
  'release_week',
  'post_release',
];

export const PLAN_PHASE_LABELS: Record<PlanPhase, string> = {
  setup: 'Setup',
  pre_release: 'Pre-release',
  release_week: 'Release week',
  post_release: 'Post-release',
};

export const PLAN_PHASE_BLURBS: Record<PlanPhase, string> = {
  setup: 'Weeks out. Lock the music, the art and the paperwork.',
  pre_release: 'The marketing ramp and final prep.',
  release_week: 'Release day and the days around it.',
  post_release: 'Keeping it alive after release day.',
};

/**
 * Which phase a task belongs to, from its offset alone.
 *
 * Templates carry no phase field: single_v0.3 marks its weeks with comment
 * banners, and only `tags` are machine readable. These boundaries line up with
 * those banners, so the four groups the plan summary and the timeline show are
 * the same weeks the playbook was written in. Any stored phase is recomputed
 * through here, so this is the only definition.
 */
export function derivePlanPhase(offsetDays: number): PlanPhase {
  if (offsetDays <= -29) return 'setup';
  if (offsetDays <= -8) return 'pre_release';
  if (offsetDays <= 7) return 'release_week';
  return 'post_release';
}
