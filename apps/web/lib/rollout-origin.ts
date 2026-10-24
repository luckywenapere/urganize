/**
 * Why a rollout was made (2026-10-24, lighter rollouts). Before this, every new
 * account HAD to make a rollout (onboarding asked for one, then the app locked
 * until one existed), so rollout counts mixed real releases with ones made to
 * get past the lock. Each rollout now records its origin in
 * `releases.metadata.origin`, beside `created_source` (2026-10-17):
 *
 *  - 'onboarding': made by the sign-up wizard (the person picked a release
 *    type there; "Nothing planned yet" makes none).
 *  - 'hint': made from an offer the app showed because of a signal: the Home
 *    card "Got a release coming?", a page that needs a rollout, or UrgAns
 *    offering after the person mentioned a release.
 *  - 'choice': made on their own (New rollout, asking UrgAns outright).
 *
 * A jsonb key, not a column: no migration, nothing to apply, and old rows read
 * as 'unknown' (or 'onboarding' when created_source says so, the one safe
 * inference). Onboarding rollouts from before 2026-10-24 are mixed: some were
 * real, some only made because the wizard required one.
 *
 * Pure, so vitest holds it.
 */

export const ROLLOUT_ORIGINS = ['choice', 'hint', 'onboarding'] as const;
export type RolloutOrigin = (typeof ROLLOUT_ORIGINS)[number];
/** What a stored rollout reads as: its origin, or 'unknown' for an old row. */
export type StoredRolloutOrigin = RolloutOrigin | 'unknown';

export function isRolloutOrigin(value: unknown): value is RolloutOrigin {
  return value === 'choice' || value === 'hint' || value === 'onboarding';
}

/**
 * The origin to store for a new rollout, from what the caller sent. The
 * sign-up wizard is always 'onboarding' whatever else it says; a caller may
 * claim 'hint'; everything else is 'choice'. 'onboarding' cannot be claimed
 * by any other caller.
 */
export function resolveRolloutOrigin(input: { source: string; origin?: unknown }): RolloutOrigin {
  if (input.source === 'onboarding') return 'onboarding';
  if (input.origin === 'hint') return 'hint';
  return 'choice';
}

/** Read a rollout's origin back from its metadata. */
export function readRolloutOrigin(metadata: Record<string, unknown> | null | undefined): StoredRolloutOrigin {
  if (!metadata || typeof metadata !== 'object') return 'unknown';
  if (isRolloutOrigin(metadata.origin)) return metadata.origin;
  // Rows from 2026-10-17 to 2026-10-24 carry created_source but no origin.
  // Only the onboarding one is a safe inference; an in-app create then may
  // have been forced by the first-rollout lock, so it stays unknown.
  if (metadata.created_source === 'onboarding') return 'onboarding';
  return 'unknown';
}
