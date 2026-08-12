/**
 * "This release is waiting to be planned" — the planner's deferred-plan flag.
 *
 * With NEXT_PUBLIC_FEATURE_RELEASE_PLANNER on, a Rollout-plan release is
 * created with no tasks at all: the manager plans it with UrgAns and approves
 * a draft, and only then do tasks exist. This flag records that a release was
 * created expecting a plan, so the workspace can show the planner as its main
 * door rather than a bare empty list.
 *
 * WHY NOT REUSE `template_pending`: that flag has live machinery attached.
 * POST /api/releases/[releaseId]/schedule reads it and instantiates all 64
 * template tasks the moment a date is set, which is exactly what the draft
 * flow must prevent. A planner release therefore never carries
 * `template_pending`, and the schedule route stays untouched: for a planner
 * release it simply writes the date.
 *
 * WHY IN `metadata` RATHER THAN A COLUMN: same reasoning as
 * lib/release-template-pending.ts — `releases.metadata` is JSONB, already
 * selected by the command-center query, and needs no migration, so the deploy
 * has no ordering requirement. The flag is transient (it clears on approval)
 * and is never queried across rows.
 */

const PLANNER_PENDING_KEY = 'planner_pending';

type ReleaseMetadata = Record<string, unknown> | null | undefined;

/** Reads the flag off a release row's `metadata`. Absent/malformed → false. */
export function readPlannerPending(metadata: ReleaseMetadata): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  return (metadata as Record<string, unknown>)[PLANNER_PENDING_KEY] === true;
}

/**
 * Returns `metadata` with the flag set to `pending`, preserving every other
 * key. Read-modify-write, because `metadata` is a single JSONB column shared
 * with anything else stored on the release — a bare overwrite would drop it.
 *
 * Clearing removes the key rather than storing `false`, so a planned release
 * carries no trace of the flag.
 */
export function writePlannerPending(
  metadata: ReleaseMetadata,
  pending: boolean
): Record<string, unknown> {
  const base: Record<string, unknown> =
    metadata && typeof metadata === 'object' ? { ...(metadata as Record<string, unknown>) } : {};

  if (pending) {
    base[PLANNER_PENDING_KEY] = true;
  } else {
    delete base[PLANNER_PENDING_KEY];
  }

  return base;
}
