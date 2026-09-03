/**
 * "This release's plan was approved through UrgAns" — a permanent marker
 * stamped once, at approval, so a founder metrics query can later tell a
 * release planned this way apart from one that started from a bare template
 * (no planner) or was hand-built entirely.
 *
 * WHY IN `metadata` RATHER THAN A COLUMN: same reasoning as
 * lib/release-planner-pending.ts — `releases.metadata` is JSONB, already
 * selected by the command-center query, and needs no migration, so the deploy
 * has no ordering requirement.
 *
 * UNLIKE `planner_pending`, this flag is never cleared by the product itself
 * once set — it is a historical fact about how the release was planned, not a
 * live state machine. `writePlannedByUrgans` still accepts `false` for
 * symmetry with the rest of this codebase's metadata-marker idiom and so a
 * test can exercise both directions, but nothing in the app calls it that way
 * today.
 */

const PLANNED_BY_URGANS_KEY = 'planned_by_urgans';

type ReleaseMetadata = Record<string, unknown> | null | undefined;

/** Reads the flag off a release row's `metadata`. Absent/malformed → false. */
export function readPlannedByUrgans(metadata: ReleaseMetadata): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  return (metadata as Record<string, unknown>)[PLANNED_BY_URGANS_KEY] === true;
}

/**
 * Returns `metadata` with the flag set, preserving every other key.
 * Read-modify-write, because `metadata` is a single JSONB column shared with
 * anything else stored on the release — a bare overwrite would drop it.
 */
export function writePlannedByUrgans(
  metadata: ReleaseMetadata,
  planned: boolean
): Record<string, unknown> {
  const base: Record<string, unknown> =
    metadata && typeof metadata === 'object' ? { ...(metadata as Record<string, unknown>) } : {};

  if (planned) {
    base[PLANNED_BY_URGANS_KEY] = true;
  } else {
    delete base[PLANNED_BY_URGANS_KEY];
  }

  return base;
}
