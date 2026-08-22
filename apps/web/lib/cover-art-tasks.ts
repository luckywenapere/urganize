/**
 * Which activities mean "the manager is holding the cover art right now".
 *
 * Ticking one of these is the moment to ask for the file: they have just
 * looked at it, and asking later means asking when they have moved on.
 *
 * Deliberately an explicit id allowlist rather than a pattern over titles or
 * tags. Two reasons:
 *
 *   1. The three playbooks name these tasks inconsistently
 *      (`w6_cover_art_first_draft`, `w10_ep_art_draft`, `w14_album_art_draft`),
 *      so there is no pattern to match on anyway.
 *   2. `templates.test.ts`'s precedent: an allowlist asserted against the live
 *      playbooks turns a renamed or deleted template task into a failing test
 *      rather than a feature that quietly stops firing.
 *
 * The four "brief the designer on cover art" tasks are excluded on purpose.
 * That is the moment the work is COMMISSIONED — no file exists yet, and
 * prompting for one would train the manager to dismiss the prompt.
 */

const SINGLE_COVER_ART_TASK_IDS = [
  'w6_cover_art_first_draft',
  'w6_upload_cover_art',
  'w5_cover_art_final_approved',
] as const;

const EP_COVER_ART_TASK_IDS = ['w10_ep_art_draft', 'w9_ep_art_approved', 'w5_upload_ep_art'] as const;

const ALBUM_COVER_ART_TASK_IDS = [
  'w14_album_art_draft',
  'w13_album_art_approved',
  'w7_upload_album_art',
] as const;

export const COVER_ART_TASK_IDS: ReadonlySet<string> = new Set<string>([
  ...SINGLE_COVER_ART_TASK_IDS,
  ...EP_COVER_ART_TASK_IDS,
  ...ALBUM_COVER_ART_TASK_IDS,
]);

/**
 * Titles that read as cover art work on a task with no template origin.
 *
 * Only consulted when `templateTaskId` is null — a manager-added or
 * planner-added activity, where there is no id to match. A template task
 * NEVER falls through to this: the allowlist above is the whole answer for
 * those, so excluding a template task there cannot be undone by its title.
 */
const TITLE_PATTERN = /\b(cover art|artwork)\b/i;

/** Commissioning the work, not delivering it. */
const COMMISSION_PATTERN = /\b(brief|commission|shortlist|find|hire|source)\b/i;

export function shouldPromptCoverArtUpload(task: {
  templateTaskId?: string | null;
  title?: string | null;
}): boolean {
  const templateTaskId = task.templateTaskId || '';
  if (templateTaskId) return COVER_ART_TASK_IDS.has(templateTaskId);

  const title = task.title || '';
  return TITLE_PATTERN.test(title) && !COMMISSION_PATTERN.test(title);
}
