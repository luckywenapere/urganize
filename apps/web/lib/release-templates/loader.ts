/**
 * Template loader — pure-function module that resolves a ReleaseType to its
 * hand-crafted Template. No database, no AI, no side effects.
 *
 * Adding a new template is one line: set the corresponding entry in TEMPLATES
 * to the imported template object.
 *
 * @see CLAUDE.md "Hand-crafted release templates" and "Build sequence priority"
 */

import { SINGLE_RELEASE_TEMPLATE } from './single';
import type { ReleaseType, Template } from './types';

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

/**
 * Registry of available templates, keyed by release type. Each slot is either
 * a concrete Template or null (not yet built). TypeScript enforces that every
 * ReleaseType has an entry, so adding a new release type without a template
 * slot is a compile error.
 */
const TEMPLATES: Record<ReleaseType, Template | null> = {
  single: SINGLE_RELEASE_TEMPLATE,
  ep: null,
  album: null,
  music_video: null,
};

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/**
 * Thrown when a template is requested for a release type that doesn't have one
 * yet. Callers can catch this specific error to show a user-friendly message
 * (e.g., "EP rollout coming soon") rather than a generic failure.
 */
export class TemplateNotAvailableError extends Error {
  /** The release type that was requested. */
  readonly releaseType: ReleaseType;

  constructor(releaseType: ReleaseType) {
    super(
      `No template available for release type: ${releaseType}. Templates are added in Phase 2 of the v1 build.`
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
  const template = TEMPLATES[releaseType];
  if (template === null) {
    throw new TemplateNotAvailableError(releaseType);
  }
  return template;
}

/**
 * Returns the list of release types that currently have a registered template.
 * Useful for the UI: only show release types the user can actually create a
 * rollout plan for.
 *
 * @returns Array of ReleaseType values with non-null templates. May be empty
 *   if no templates have been added yet (Phase 2).
 */
export function getAvailableReleaseTypes(): ReleaseType[] {
  return (Object.keys(TEMPLATES) as ReleaseType[]).filter(
    (rt) => TEMPLATES[rt] !== null
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
