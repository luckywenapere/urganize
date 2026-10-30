/**
 * "Confirm your release date", pinned at the top of a new user's first plan
 * (URG-251 flow, step 8; 2026-10-14).
 *
 * Every rollout plan is anchored to its release date, and a new person's date
 * is often a working guess, so the activity that locks it sits on top of the
 * plan they land on until it is done. It exists in every playbook (2nd in the
 * single, 4th in the EP, 5th in the album) and a start-from-scratch rollout
 * made in onboarding is seeded with exactly this one activity.
 *
 * Matched by the playbook's own task id wherever there is one, which survives
 * a rename and the planner's tailoring (the planner keeps template provenance
 * in metadata.template.task_id). The title is only a fallback, and a narrow
 * one: the later "...locked at the distributor" check must never match.
 *
 * "New user" = the rollout onboarding created in this browser (the first-
 * session record's rollout, lib/first-session.ts). Pure, so vitest holds it.
 */

import { isTaskClosed } from '@/types/tasks';

/** The task id the start-from-scratch seed carries (see app/api/releases). */
export const ONBOARDING_CONFIRM_DATE_TASK_ID = 'onboarding_confirm_release_date';
export const ONBOARDING_BLANK_TEMPLATE_ID = 'onboarding_blank_v1';
export const CONFIRM_RELEASE_DATE_TITLE = 'Confirm your release date';
export const CONFIRM_RELEASE_DATE_DESCRIPTION =
  'Lock in the public release date with the artist and team. Every other activity is planned around it.';

/** The playbook ids of "confirm and lock the release date", one per playbook. */
export const CONFIRM_RELEASE_DATE_TASK_IDS: ReadonlySet<string> = new Set([
  'w8_confirm_release_date', // single_v0.3
  'w13_confirm_release_date', // ep_v0.1
  'w17_confirm_release_date', // album_v0.1
  ONBOARDING_CONFIRM_DATE_TASK_ID,
]);

const TITLE_FALLBACK = /^confirm (your |the )?((ep|album|single) )?release date( and lock it)?\.?$/i;

export type PinnableTask = {
  id: string;
  title: string;
  status: string;
  templateTaskId?: string | null;
};

export function isConfirmReleaseDateTask(task: Pick<PinnableTask, 'title' | 'templateTaskId'>): boolean {
  if (task.templateTaskId) return CONFIRM_RELEASE_DATE_TASK_IDS.has(task.templateTaskId);
  return TITLE_FALLBACK.test(task.title.trim());
}


/**
 * The task to pin, or null. Only for a new user's onboarding rollout, and only
 * while the task is still open: once it is done the pin goes, and the task
 * sits where the plan puts it.
 */
export function findPinnedConfirmDateTask<T extends PinnableTask>(input: {
  tasks: readonly T[];
  isNewUserRollout: boolean;
}): T | null {
  if (!input.isNewUserRollout) return null;
  return input.tasks.find((task) => !isTaskClosed(task.status) && isConfirmReleaseDateTask(task)) ?? null;
}

/** The one activity a start-from-scratch onboarding rollout begins with. Its
 *  due date is tomorrow, or release day if that is sooner. */
export function blankSeedDueDate(input: { now: number; releaseDate: string | null }): string {
  const tomorrow = input.now + 24 * 60 * 60 * 1000;
  const releaseMs = input.releaseDate ? Date.parse(`${input.releaseDate}T00:00:00Z`) : Number.NaN;
  const due = Number.isFinite(releaseMs) ? Math.min(tomorrow, releaseMs) : tomorrow;
  return new Date(due).toISOString();
}
