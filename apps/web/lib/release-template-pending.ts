/**
 * "This release owes its rollout plan" — the deferred-instantiation flag
 * (URG-230).
 *
 * The release date became optional at creation, but template instantiation
 * dates every activity as an offset from release day and cannot run without
 * one. A Rollout-plan release created with no date therefore holds its plan
 * until a date arrives, and this flag is what remembers that it owes one.
 *
 * WHY A FLAG AT ALL: "no date and no activities" equally describes a Blank
 * release, which must never be handed a template. The two are
 * indistinguishable without recording the original intent.
 *
 * WHY IN `metadata` RATHER THAN A COLUMN: a dedicated column would have to be
 * added to the SELECT in lib/services/release-service.ts, which backs
 * /api/command-center — the query behind every dashboard load. Migrations in
 * this repo are applied by hand, so shipping that code before the migration
 * lands would 500 the whole app. `releases.metadata` is JSONB, already
 * selected by that same query, and needs no migration, so the deploy has no
 * ordering requirement. The flag is transient (it clears the moment a date is
 * set) and is never queried across rows, so it gains nothing from being a
 * typed column.
 */

const TEMPLATE_PENDING_KEY = 'template_pending';

type ReleaseMetadata = Record<string, unknown> | null | undefined;

/** Reads the flag off a release row's `metadata`. Absent/malformed → false. */
export function readTemplatePending(metadata: ReleaseMetadata): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  return (metadata as Record<string, unknown>)[TEMPLATE_PENDING_KEY] === true;
}

/**
 * Returns `metadata` with the flag set to `pending`, preserving every other
 * key. Read-modify-write, because `metadata` is a single JSONB column shared
 * with anything else that may be stored on the release — a bare overwrite
 * would silently drop it.
 *
 * Clearing removes the key rather than storing `false`, so a settled release
 * carries no trace of the flag.
 */
export function writeTemplatePending(
  metadata: ReleaseMetadata,
  pending: boolean
): Record<string, unknown> {
  const base: Record<string, unknown> =
    metadata && typeof metadata === 'object' ? { ...(metadata as Record<string, unknown>) } : {};

  if (pending) {
    base[TEMPLATE_PENDING_KEY] = true;
  } else {
    delete base[TEMPLATE_PENDING_KEY];
  }

  return base;
}
