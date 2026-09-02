/**
 * Decision logic for the release setup prompt (type-first create,
 * NEXT_PUBLIC_FEATURE_TYPE_FIRST_CREATE — founder call, 2026-09-01).
 *
 * Under the type-first flow a release is created from a single tap on its
 * type: no title, no date. The workspace then nudges ONCE per release — a
 * bottom sheet asking for the name and the release date — after the user has
 * explored a little (first scroll, first scene open, or a short dwell,
 * whichever comes first; a brand-new release has no activities, so a
 * scroll-only trigger could literally never fire).
 *
 * Pure module so vitest can hold the rules; the DOM listeners live in
 * components/workspace/useReleaseSetupPrompt.ts. The "already prompted"
 * marker persists in localStorage via lib/persisted-state.ts — marked when
 * the sheet OPENS, not when it is dismissed, so it is one nudge per release
 * ever. The undismissable SetReleaseDateCard in the activities panel remains
 * the persistent path for anyone who waves the sheet away.
 */

export const SETUP_PROMPT_STORAGE_KEY = 'urganize.workspace.setup-prompted';
export const SETUP_PROMPT_STORAGE_VERSION = 1;

/** Dwell fallback: the prompt fires this long after landing in the release
 * even if the user never scrolls or opens a scene. */
export const SETUP_PROMPT_DWELL_MS = 10_000;

/** Keep the marker list small — nobody needs a permanent record of every
 * release ever nudged, only enough that recent ones never re-nag. */
export const SETUP_PROMPT_MAX_MARKED = 20;

/** Type guard for the persisted marker list (readPersistedState validator). */
export function isPromptedList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

export function hasBeenPrompted(list: unknown, releaseId: string): boolean {
  return isPromptedList(list) && list.includes(releaseId);
}

/** Append a release id to the marker list, newest last, capped. Never
 * duplicates; tolerates a malformed stored value by starting fresh. */
export function markPrompted(list: unknown, releaseId: string): string[] {
  const base = isPromptedList(list) ? list.filter((id) => id !== releaseId) : [];
  const next = [...base, releaseId];
  return next.length > SETUP_PROMPT_MAX_MARKED
    ? next.slice(next.length - SETUP_PROMPT_MAX_MARKED)
    : next;
}

/**
 * Should the trigger listeners be armed at all for this release?
 *
 * Only a plan-waiting release with no date has anything to ask for — the
 * sheet's whole job is the name + the date that builds the plan. A release
 * that already has a date (or was never a rollout release) gets nothing.
 */
export function shouldArmSetupPrompt(input: {
  flagOn: boolean;
  releaseId: string | null;
  templatePending: boolean;
  hasReleaseDate: boolean;
  alreadyPrompted: boolean;
}): boolean {
  return (
    input.flagOn &&
    Boolean(input.releaseId) &&
    input.templatePending &&
    !input.hasReleaseDate &&
    !input.alreadyPrompted
  );
}
