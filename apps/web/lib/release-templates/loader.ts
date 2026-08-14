/**
 * Template loader — pure-function module that resolves a ReleaseType to its
 * hand-crafted Template. No database, no AI, no side effects.
 *
 * Adding a new template is one line: set the corresponding entry in
 * AUTHORED_TEMPLATES to the imported template object.
 *
 * @see CLAUDE.md "Hand-crafted release templates" and "Build sequence priority"
 */

import { ALBUM_RELEASE_TEMPLATE } from './album';
import { EP_RELEASE_TEMPLATE } from './ep';
import { SINGLE_RELEASE_TEMPLATE } from './single';
import type { ReleaseType, Template } from './types';

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

/**
 * The EP and album playbooks are v0.1 drafts that have not had the two
 * design-partner review passes single_v0.3 went through, so they stay dark
 * until this is 'true'.
 *
 * Read at CALL time, not module scope (the isReleasePlannerEnabled precedent):
 * NEXT_PUBLIC_* is still inlined into client bundles at build time, and a
 * call-time read is what makes the flag stubbable with vi.stubEnv in tests.
 *
 * This is the ONE gate for the whole feature. Everything downstream — the
 * onboarding type picker, the create-release modal's picker, the create and
 * schedule routes' template instantiation, the planner's per-type template —
 * derives from getTemplate/getAvailableReleaseTypes below, so they cannot
 * disagree about whether EP and album exist.
 */
export const isEpAlbumTemplatesEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES === 'true';

/** Release types this flag gates. Single is always on; music_video has no template. */
const FLAGGED_RELEASE_TYPES = new Set<ReleaseType>(['ep', 'album']);

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

/**
 * Every template that has been WRITTEN, regardless of whether it is switched
 * on. Each slot is either a concrete Template or null (not yet authored).
 * TypeScript enforces that every ReleaseType has an entry, so adding a new
 * release type without a template slot is a compile error.
 *
 * `music_video` is null because no music-video playbook has been authored —
 * and note it is not a value the database `release_type` enum accepts either
 * (see DB_RELEASE_TYPES in types/releases.ts), so it cannot be stored today.
 */
const AUTHORED_TEMPLATES: Record<ReleaseType, Template | null> = {
  single: SINGLE_RELEASE_TEMPLATE,
  ep: EP_RELEASE_TEMPLATE,
  album: ALBUM_RELEASE_TEMPLATE,
  music_video: null,
};

/**
 * The flag gate. Resolves a release type to the template a USER may currently
 * get: null when the template was never authored, and also null when it is
 * authored but still behind the flag.
 */
function resolveTemplateSlot(releaseType: ReleaseType): Template | null {
  const template = AUTHORED_TEMPLATES[releaseType];
  if (template === null) return null;
  if (FLAGGED_RELEASE_TYPES.has(releaseType) && !isEpAlbumTemplatesEnabled()) {
    return null;
  }
  return template;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/**
 * Thrown when a template is requested for a release type that cannot currently
 * be planned — either no playbook has been authored for it (music_video), or
 * one has been authored but is still behind
 * NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES (ep, album).
 *
 * Callers can catch this specific error to show a user-friendly message
 * (e.g., "EP rollout coming soon") rather than a generic failure.
 */
export class TemplateNotAvailableError extends Error {
  /** The release type that was requested. */
  readonly releaseType: ReleaseType;

  constructor(releaseType: ReleaseType) {
    super(
      `No template available for release type: ${releaseType}. ` +
        `Either no playbook has been authored for it, or it is still behind ` +
        `NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES.`
    );
    this.name = 'TemplateNotAvailableError';
    this.releaseType = releaseType;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up the template for a given release type.
 *
 * @param releaseType - The type of release to get a template for.
 * @returns The matching Template object.
 * @throws {TemplateNotAvailableError} If no template has been registered for
 *   the given release type (i.e., the slot is still null).
 */
export function getTemplate(releaseType: ReleaseType): Template {
  const template = resolveTemplateSlot(releaseType);
  if (template === null) {
    throw new TemplateNotAvailableError(releaseType);
  }
  return template;
}

/**
 * Flag-BLIND lookup: returns an authored template even when the flag that
 * gates it is off. Returns null only when no template was ever written.
 *
 * Use this for EXISTING data — validating the task ids inside a plan draft
 * that was generated while the flag was on. If the flag is rolled back
 * mid-draft, a flag-aware lookup would fall back to the single playbook and
 * every autosave would reject the draft's own task ids, losing the manager's
 * edits.
 *
 * Never use this to decide what a user may CREATE — that is getTemplate's job.
 */
export function getAuthoredTemplate(releaseType: ReleaseType): Template | null {
  return AUTHORED_TEMPLATES[releaseType];
}

/**
 * Returns the list of release types a user can currently plan — authored AND
 * switched on. This is the UI gate: the onboarding step-0 picker and the
 * create-release modal's type picker both derive their options from it, so
 * neither can offer a type that would fail to instantiate.
 *
 * @returns Array of ReleaseType values that resolve to a template right now.
 *   With the EP/album flag off this is just `['single']`.
 */
export function getAvailableReleaseTypes(): ReleaseType[] {
  return (Object.keys(AUTHORED_TEMPLATES) as ReleaseType[]).filter(
    (rt) => resolveTemplateSlot(rt) !== null
  );
}

/**
 * How many days before the release date the template's earliest task starts.
 *
 * Derived from the most-negative `offset_days` across the template's tasks —
 * if that drifts when the template is edited, this value drifts with it
 * automatically. For single_v0.3 the value is 56 (Week 8 pre-release).
 *
 * Used by the create-release form to recommend a release date that gives the
 * full template runway, and to detect when the picked date is sooner than
 * the template was designed for (the "compressed runway" case that produces
 * past-due tasks at instantiation).
 */
export function getTemplateLeadTimeDays(template: Template): number {
  let minOffset = 0;
  for (const task of template.tasks) {
    if (task.offset_days < minOffset) minOffset = task.offset_days;
  }
  return -minOffset;
}

/**
 * Total day-span of the template, from earliest pre-release task to latest
 * post-release task. For single_v0.3 the value is 78 (-56 → +22).
 *
 * Used for human-readable copy ("plans ~N weeks of work"). Distinct from
 * {@link getTemplateLeadTimeDays}, which counts only the pre-release runway
 * — the bit that determines whether tasks are past-due at creation.
 */
export function getTemplateSpanDays(template: Template): number {
  let minOffset = 0;
  let maxOffset = 0;
  for (const task of template.tasks) {
    if (task.offset_days < minOffset) minOffset = task.offset_days;
    if (task.offset_days > maxOffset) maxOffset = task.offset_days;
  }
  return maxOffset - minOffset;
}

/** The numbers UI copy quotes about a template. All derived, never hardcoded. */
export type TemplateStats = {
  /** How many activities the template creates. */
  activityCount: number;
  /** Weeks of pre-release runway (from the earliest task to release day). */
  leadWeeks: number;
  /** Total weeks the plan spans, earliest task to latest. */
  spanWeeks: number;
};

/**
 * Template numbers for copy, by release type, with a single-playbook fallback.
 *
 * Never throws: a release type with no template (music_video, or EP/album with
 * the flag off) resolves to the single template's numbers, which is what the
 * product would actually instantiate for it anyway. Components can therefore
 * call this unconditionally instead of each re-deriving from getTemplate and
 * risking a module-scope throw.
 */
export function getTemplateStats(releaseType: ReleaseType): TemplateStats {
  const template = resolveTemplateSlot(releaseType) ?? SINGLE_RELEASE_TEMPLATE;
  return {
    activityCount: template.tasks.length,
    leadWeeks: Math.round(getTemplateLeadTimeDays(template) / 7),
    spanWeeks: Math.round(getTemplateSpanDays(template) / 7),
  };
}
